// The Cattle-Climate Feedback Loop - Team 22
// Coordinated multi-view dashboard (Martini Glass), all driven by one shared time slider.
//   View 1 (main character): choropleth world map of agricultural CH4 emissions by country.
//   View 2: dual-axis lag chart - global CH4 (left axis) vs global temperature anomaly (right).
//   View 3: bar chart of the top-10 emitting countries for the selected year.
// Interactions: shared time slider + play/pause, hover tooltips, click a country to highlight
//   it across the map and the bar chart, animated transitions on every year change.
//
// Data: beef-attributed cattle methane (kt CH4, 1990-2021) = FAOSTAT cattle CH4 (GLE,
//   "Livestock total (Emissions CH4)", FAO TIER 1) split by each country's beef:dairy ratio
//   from FAOSTAT Emissions intensities (EI, CO2eq of "Meat of cattle" vs "Raw milk of cattle").
//   Beef's share is therefore an estimate, disclosed in the UI. Temperature: FAO World
//   "Meteorological year" anomaly (degC, 1961-2019). Geo: world-atlas. See data/build_beef_methane.ps1.
// Join: FAO "Area Code (M49)" matches the numeric country id in the world-atlas TopoJSON.
// Coding style follows the class stack (HW2/HW3): D3 v5, responsive draw() + resize,
//   margin-convention, d3.json/d3.csv(...).then().catch(), enter/update/exit, inline comments.

const MIN_YEAR = 1990;          // earliest year in the emissions dataset
const MAX_YEAR = 2021;          // latest year in the emissions dataset
let currentYear = MAX_YEAR;     // year currently shown (driven by the shared slider)
let selectedM49 = null;         // m49 of the clicked country, or null when nothing selected

// cached data (built once on load, reused on every resize redraw)
let worldFeatures   = null;     // array of GeoJSON country features
let ch4ByYear       = null;     // Map: year -> Map(m49 -> CH4 kt)
let countryName     = null;     // Map: m49 -> country name
let ch4GlobalByYear = null;     // Map: year -> summed global CH4 kt
let tempByYear      = null;     // Map: year -> global temperature anomaly (degC)
let colorMax = 1;               // max single-country CH4 (map color + bar x domain)
let ch4GlobalMax = 1;           // max global CH4 (lag chart left axis)
let tempMax = 1;                // max global anomaly (lag chart right axis)
let playTimer = null;           // d3.interval handle while the animation is playing

// ---- guided-tour state (Martini Glass: 5 author-driven acts, then free exploration) ----
let tourActive = true;          // true while the guided tour is running
let actIndex = 0;               // current act (0-based)
let viewBounds = {};            // {map,lag,bar} pixel rects, captured each draw() for focus highlight
const ACCENT = "#2c7fb8";       // tour highlight color (matches CH4 blue)
const BRAZIL_M49 = 76;          // largest beef-attributed methane emitter (highlighted in Act 4)

// Each act sets the year, an optional selected country, which view to spotlight, an optional
// auto-play, and the narrative copy shown in the on-screen card.
const ACTS = [
    {
        year: 1990, select: null, focus: "map", play: false,
        title: "The Hidden Connection",
        body: "Raising cattle for beef releases methane (CH\u2084) \u2014 a gas dozens of times stronger than CO\u2082 over its lifetime. The map shades each country by the methane attributed to its beef herds; darker means more. Even in 1990 a few beef-producing nations dominate. (Beef's share is estimated from FAO's beef-vs-dairy emission split.)"
    },
    {
        year: 2019, select: null, focus: "lag", play: true,
        title: "The Lag",
        body: "Watch the two lines on the right. Methane (blue) climbs steadily, but the temperature anomaly (red) keeps responding years later. This 5-to-10-year lag is exactly why the beef\u2013climate link is so easy to miss in year-by-year data."
    },
    {
        year: 2021, select: null, focus: "bar", play: false,
        title: "The Wrong Direction",
        body: "Methane has caused about 30% of global warming since pre-industrial times (UN Environment Programme), and the IPCC says it must fall 40\u201345% by 2030 to keep 1.5\u00b0C within reach. Beef pulls the other way: enteric fermentation is the single largest farm-methane source (FAO), and this beef-attributed methane has risen about 29% since 1990. Drag the slider 1990\u20132021 \u2014 the same handful of beef producers stays on top, and the total keeps climbing."
    },
    {
        year: 2021, select: BRAZIL_M49, focus: "map", play: false,
        title: "The Beef Frontier",
        body: "Brazil (highlighted) is the single largest source of beef-attributed methane, driven by its vast beef-cattle herd and pasture expansion. Tellingly, India \u2014 the top emitter of total agricultural methane \u2014 ranks far lower here, because its cattle are raised mostly for dairy and draught, not beef."
    },
    {
        year: 2021, select: null, focus: "map", play: false,
        title: "The Power on Your Plate",
        body: "So where do you come in? The herds expanding across Brazil and the Americas are driven by global demand \u2014 and beef has the highest methane footprint of any food per gram of protein. Because methane is short-lived, eating less beef slows warming fast; and unlike dairy manure, a grazing animal's methane can't be captured, so lower demand is the most direct lever we have. Now explore the data yourself \u2014 any year, any country \u2014 and see where your plate fits in."
    }
];

// sequential color scale (light -> deep red). We color by sqrt(value) to spread the
// heavily skewed distribution (a few huge emitters dominate the raw scale).
const colorScale = d3.scaleSequential(d3.interpolateYlOrRd);
const tooltip = d3.select("#tooltip");

const CH4_COLOR  = "#2c7fb8";   // emissions encoded blue across the lag chart
const TEMP_COLOR = "#e34a33";   // temperature encoded red across the lag chart

// scales/refs assigned in draw(), reused by the update functions
let lagX, lagYch4, lagYtemp;
let barXScale, barRowH, barLabelW;

// ---- small helpers -------------------------------------------------------

// subtitle text reflects the year currently shown
function subtitleText() {
    return `Beef-attributed cattle methane (CH\u2084) by country, ${currentYear} \u2014 kilotonnes (estimated)`;
}

// short story caption that changes by era (lightweight narrative layer)
function narrativeText(year) {
    if (year <= 1995) return "Early 1990s: beef herds are already a major methane source, but global warming is only beginning to climb.";
    if (year <= 2005) return "2000s: beef production expands \u2014 especially across the Americas \u2014 and methane keeps rising as the temperature anomaly accelerates.";
    if (year <= 2015) return "2010s: methane and temperature climb together as the beef\u2013climate feedback loop tightens.";
    return "Recent years: beef-driven methane reaches record highs; the full warming response is still unfolding.";
}

// fill color for a CH4 value (grey if no data)
function fillFor(v) { return v == null ? "#eaeaea" : colorScale(Math.sqrt(v)); }

// top-n emitting countries for a given year, sorted descending
function topEmitters(year, n) {
    const m = ch4ByYear.get(year) || new Map();
    const arr = [];
    m.forEach(function(val, m49) { arr.push({ m49: m49, val: val, name: countryName.get(m49) || ("#" + m49) }); });
    arr.sort((a, b) => b.val - a.val);
    return arr.slice(0, n);
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }

// ---- draw: builds the whole scene; called on load and on every resize ----
function draw() {
    const width  = window.innerWidth;
    const height = window.innerHeight;

    const svg = d3.select("svg");
    svg.selectAll("*").remove();    // clear before redraw

    const margin = { top: 74, right: 18, bottom: 58, left: 18 };  // bottom leaves room for control bar
    const innerW = width  - margin.left - margin.right;
    const innerH = height - margin.top  - margin.bottom;
    const gap = 26;
    const mapW = Math.max(320, innerW * 0.55);
    const rightW = Math.max(220, innerW - mapW - gap);

    // ---- header (title + year subtitle + narrative caption) ----
    svg.append("text").attr("x", margin.left).attr("y", 28)
        .attr("font-size", "20px").attr("font-weight", "bold").attr("fill", "#222")
        .text("The Cattle-Climate Feedback Loop");
    svg.append("text").attr("class", "subtitle").attr("x", margin.left).attr("y", 47)
        .attr("font-size", "13px").attr("fill", "#666").text(subtitleText());
    svg.append("text").attr("class", "narrative").attr("x", margin.left).attr("y", 65)
        .attr("font-size", "11px").attr("font-style", "italic").attr("fill", "#888")
        .text(narrativeText(currentYear));
    // methods/source disclosure (top-right of header)
    svg.append("text").attr("x", width - margin.right).attr("y", 28).attr("text-anchor", "end")
        .attr("font-size", "10px").attr("fill", "#aaa")
        .text("Beef share estimated from FAO beef/dairy emission split \u00b7 Data: FAOSTAT GLE + EI");

    // ===================== View 1: choropleth map =====================
    const mapG = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    const fc = { type: "FeatureCollection", features: worldFeatures };
    const projection = d3.geoNaturalEarth1().fitSize([mapW, innerH], fc);
    const path = d3.geoPath().projection(projection);
    const yearData = ch4ByYear.get(currentYear) || new Map();

    mapG.selectAll("path.country").data(worldFeatures).enter().append("path")
        .attr("class", "country").attr("d", path)
        .attr("fill", d => fillFor(yearData.get(+d.id)))
        .attr("stroke", "#fff").attr("stroke-width", 0.4)
        .style("cursor", "pointer")
        .on("mousemove", function(d) {               // details-on-demand
            // read the CURRENT year's data live (not the draw-time snapshot) so the
            // tooltip stays in sync with the slider/animation, matching the map fill.
            const v = (ch4ByYear.get(currentYear) || new Map()).get(+d.id);
            const name = (d.properties && d.properties.name) ? d.properties.name : "Unknown";
            tooltip.style("opacity", 1)
                .style("left", (d3.event.pageX + 12) + "px")
                .style("top",  (d3.event.pageY + 12) + "px")
                .html(`<strong>${name}</strong><br>` +
                      (v == null ? "No data" : `Beef CH\u2084: ${d3.format(",.0f")(v)} kt`));
            if (+d.id !== selectedM49) d3.select(this).attr("stroke", "#222").attr("stroke-width", 1);
        })
        .on("mouseout", function(d) {
            tooltip.style("opacity", 0);
            d3.select(this)                          // restore selected highlight or default
                .attr("stroke", +d.id === selectedM49 ? "#111" : "#fff")
                .attr("stroke-width", +d.id === selectedM49 ? 1.6 : 0.4);
        })
        .on("click", function(d) { toggleSelect(+d.id); });

    drawMapLegend(mapG, innerH, mapW);

    // ===================== right column: views 2 + 3 =====================
    const rightG = svg.append("g")
        .attr("transform", `translate(${margin.left + mapW + gap}, ${margin.top})`);
    const rGap = 24;
    const lagBoxH = innerH * 0.52 - rGap / 2;
    const barBoxH = innerH - lagBoxH - rGap;

    buildLagChart(rightG, rightW, lagBoxH);
    buildBarChart(rightG.append("g").attr("transform", `translate(0, ${lagBoxH + rGap})`), rightW, barBoxH);

    // record each view's pixel rectangle so the guided tour can spotlight one at a time
    const rightX = margin.left + mapW + gap;
    viewBounds = {
        map: { x: margin.left, y: margin.top, w: mapW, h: innerH },
        lag: { x: rightX, y: margin.top, w: rightW, h: lagBoxH },
        bar: { x: rightX, y: margin.top + lagBoxH + rGap, w: rightW, h: barBoxH }
    };

    // apply year- and selection-dependent state to the freshly built scene
    updateYear(currentYear, 0);
    updateSelection();
    applyFocus(0);              // re-draw tour spotlight (svg was cleared above)
}

// draw / move the guided-tour spotlight rectangle around the currently focused view.
// Cleared automatically when the tour ends or when no view is focused.
function applyFocus(dur) {
    const svg = d3.select("svg");
    svg.selectAll(".tour-focus").remove();
    if (!tourActive) return;
    const act = ACTS[actIndex];
    const b = act && viewBounds[act.focus];
    if (!b) return;
    const pad = 8;
    svg.append("rect")                          // appended last so it sits on top of the charts
        .attr("class", "tour-focus")
        .attr("x", b.x - pad).attr("y", b.y - pad)
        .attr("width", b.w + pad * 2).attr("height", b.h + pad * 2)
        .attr("rx", 6).attr("fill", "none")
        .attr("stroke", ACCENT).attr("stroke-width", 2.5)
        .attr("stroke-dasharray", "6,4")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .transition().duration(dur || 0).style("opacity", 1);
}

// ---- View 2: dual-axis global CH4 vs temperature anomaly -----------------
function buildLagChart(parent, boxW, boxH) {
    parent.append("text").attr("x", 0).attr("y", 6)
        .attr("font-size", "13px").attr("font-weight", "bold").attr("fill", "#333")
        .text("Global beef-cattle methane vs. temperature anomaly");

    const m = { top: 30, right: 52, bottom: 22, left: 56 };
    const w = Math.max(60, boxW - m.left - m.right);
    const h = Math.max(60, boxH - m.top - m.bottom);
    const g = parent.append("g").attr("class", "lag").attr("transform", `translate(${m.left}, ${m.top})`);

    lagX     = d3.scaleLinear().domain([MIN_YEAR, MAX_YEAR]).range([0, w]);
    lagYch4  = d3.scaleLinear().domain([0, ch4GlobalMax]).range([h, 0]).nice();
    lagYtemp = d3.scaleLinear().domain([0, tempMax * 1.1]).range([h, 0]).nice();

    g.append("g").attr("transform", `translate(0, ${h})`)
        .call(d3.axisBottom(lagX).ticks(6).tickFormat(d3.format("d")));
    g.append("g").call(d3.axisLeft(lagYch4).ticks(4).tickFormat(d3.format("~s")))
        .selectAll("text").attr("fill", CH4_COLOR);
    g.append("g").attr("transform", `translate(${w}, 0)`)
        .call(d3.axisRight(lagYtemp).ticks(4).tickFormat(d => "+" + d.toFixed(1)))
        .selectAll("text").attr("fill", TEMP_COLOR);

    g.append("text").attr("transform", "rotate(-90)").attr("x", -h / 2).attr("y", -44)
        .attr("text-anchor", "middle").attr("font-size", "10px").attr("fill", CH4_COLOR)
        .text("CH\u2084 emissions (kt)");
    g.append("text").attr("transform", "rotate(-90)").attr("x", -h / 2).attr("y", w + 42)
        .attr("text-anchor", "middle").attr("font-size", "10px").attr("fill", TEMP_COLOR)
        .text("Temp anomaly (\u00b0C)");

    // global series (CH4 1990-2021, temperature 1990-2019)
    const ch4Series = [], tempSeries = [];
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
        if (ch4GlobalByYear.has(y)) ch4Series.push({ year: y, v: ch4GlobalByYear.get(y) });
        if (tempByYear.has(y))      tempSeries.push({ year: y, v: tempByYear.get(y) });
    }
    g.append("path").datum(ch4Series).attr("fill", "none").attr("stroke", CH4_COLOR).attr("stroke-width", 2)
        .attr("d", d3.line().x(d => lagX(d.year)).y(d => lagYch4(d.v)));
    g.append("path").datum(tempSeries).attr("fill", "none").attr("stroke", TEMP_COLOR).attr("stroke-width", 2)
        .attr("d", d3.line().x(d => lagX(d.year)).y(d => lagYtemp(d.v)));

    // scrubber + moving dots + readouts (updated by updateYear)
    g.append("line").attr("class", "scrubber").attr("y1", 0).attr("y2", h)
        .attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-dasharray", "3,3");
    g.append("circle").attr("class", "ch4-dot").attr("r", 4).attr("fill", CH4_COLOR);
    g.append("circle").attr("class", "temp-dot").attr("r", 4).attr("fill", TEMP_COLOR);
    g.append("text").attr("class", "ch4-readout").attr("x", 0).attr("y", -8)
        .attr("font-size", "10px").attr("fill", CH4_COLOR);
    g.append("text").attr("class", "temp-readout").attr("x", w).attr("y", -8)
        .attr("text-anchor", "end").attr("font-size", "10px").attr("fill", TEMP_COLOR);
}

// ---- View 3: top-10 emitters bar chart -----------------------------------
function buildBarChart(g, boxW, boxH) {
    g.append("text").attr("class", "bar-title").attr("x", 0).attr("y", 6)
        .attr("font-size", "13px").attr("font-weight", "bold").attr("fill", "#333")
        .text("Top 10 beef-methane emitters");
    g.append("text").attr("class", "sel-label").attr("x", 0).attr("y", 22)
        .attr("font-size", "10px").attr("fill", "#888")
        .text("Click a country to highlight it");

    const m = { top: 32, right: 46, bottom: 16, left: 4 };
    const w = Math.max(60, boxW - m.left - m.right);
    const h = Math.max(60, boxH - m.top - m.bottom);
    barLabelW = 96;
    barRowH = h / 10;
    barXScale = d3.scaleLinear().domain([0, colorMax]).range([0, Math.max(10, w - barLabelW)]);

    g.append("g").attr("class", "bars").attr("transform", `translate(0, ${m.top})`);
}

// rebuild the bar rows for the current year (enter/update/exit, keyed by m49)
function updateBarChart(dur) {
    const data = topEmitters(currentYear, 10);
    d3.select(".bar-title").text(`Top 10 beef-methane emitters \u2014 ${currentYear}`);

    const rows = d3.select("svg").select(".bars").selectAll("g.bar-row").data(data, d => d.m49);

    rows.exit().transition().duration(dur).style("opacity", 0).remove();

    const ent = rows.enter().append("g").attr("class", "bar-row")
        .style("cursor", "pointer").style("opacity", 0)
        .on("click", function(d) { toggleSelect(d.m49); });
    ent.append("rect").attr("class", "bar-rect").attr("x", barLabelW).attr("height", Math.max(4, barRowH - 6));
    ent.append("text").attr("class", "bar-name").attr("x", barLabelW - 5).attr("y", barRowH / 2)
        .attr("dy", "0.32em").attr("text-anchor", "end").attr("font-size", "10px");
    ent.append("text").attr("class", "bar-val").attr("y", barRowH / 2)
        .attr("dy", "0.32em").attr("font-size", "9px").attr("fill", "#555");

    const merged = ent.merge(rows);
    merged.transition().duration(dur).style("opacity", 1)
        .attr("transform", (d, i) => `translate(0, ${i * barRowH})`);
    merged.select(".bar-rect").transition().duration(dur)
        .attr("width", d => Math.max(1, barXScale(d.val)))
        .attr("fill", d => fillFor(d.val))
        .attr("stroke", d => d.m49 === selectedM49 ? "#111" : "none")
        .attr("stroke-width", d => d.m49 === selectedM49 ? 1.5 : 0);
    merged.select(".bar-name")
        .attr("font-weight", d => d.m49 === selectedM49 ? "bold" : "normal")
        .text(d => truncate(d.name, 15));
    merged.select(".bar-val").transition().duration(dur)
        .attr("x", d => barLabelW + Math.max(1, barXScale(d.val)) + 4)
        .text(d => d3.format(",.0f")(d.val));
}

// recolor the map + move the scrubber + rebuild bars for a given year (timestep transition).
// dur = 0 gives an immediate update (used while dragging the slider).
function updateYear(year, dur) {
    currentYear = year;
    const yearData = ch4ByYear.get(currentYear) || new Map();

    // View 1: recolor map
    d3.select("svg").selectAll("path.country").transition().duration(dur)
        .attr("fill", d => fillFor(yearData.get(+d.id)));

    // View 2: scrubber, moving dots and readouts
    if (lagX) {
        const cx = lagX(currentYear);
        d3.select(".scrubber").transition().duration(dur).attr("x1", cx).attr("x2", cx);
        const cg = ch4GlobalByYear.get(currentYear);
        d3.select(".ch4-dot").transition().duration(dur).attr("cx", cx).attr("cy", lagYch4(cg));
        d3.select(".ch4-readout").text(`CH\u2084: ${d3.format(",.0f")(cg)} kt`);
        const tv = tempByYear.get(currentYear);
        d3.select(".temp-dot").style("opacity", tv == null ? 0 : 1);
        if (tv != null) d3.select(".temp-dot").transition().duration(dur).attr("cx", cx).attr("cy", lagYtemp(tv));
        d3.select(".temp-readout").text(tv == null ? "\u0394T: n/a (ends 2019)" : `\u0394T: +${tv.toFixed(2)}\u00b0C`);
    }

    // View 3: bars
    updateBarChart(dur);

    // header + control sync
    d3.select(".subtitle").text(subtitleText());
    d3.select(".narrative").text(narrativeText(currentYear));
    d3.select("#year-slider").property("value", currentYear);
    d3.select("#year-label").text(currentYear);
}

// ---- selection: click a country to highlight it across map + bar chart ----
function toggleSelect(m49) {
    selectedM49 = (selectedM49 === m49) ? null : m49;
    updateSelection();
}

function updateSelection() {
    d3.select("svg").selectAll("path.country")
        .attr("stroke", d => +d.id === selectedM49 ? "#111" : "#fff")
        .attr("stroke-width", d => +d.id === selectedM49 ? 1.6 : 0.4);

    const barRows = d3.select("svg").selectAll("g.bar-row");
    barRows.select(".bar-rect")
        .attr("stroke", d => d.m49 === selectedM49 ? "#111" : "none")
        .attr("stroke-width", d => d.m49 === selectedM49 ? 1.5 : 0);
    barRows.select(".bar-name").attr("font-weight", d => d.m49 === selectedM49 ? "bold" : "normal");

    const name = selectedM49 != null ? (countryName.get(selectedM49) || "") : "";
    d3.select(".sel-label").text(name ? `Selected: ${name}  (click again to clear)` : "Click a country to highlight it");
}

// play/pause auto-advance through the years (Gapminder-style)
function togglePlay() {
    const btn = d3.select("#play-btn");
    if (playTimer) {                                  // currently playing -> pause
        playTimer.stop();
        playTimer = null;
        btn.html("&#9654; Play");
        return;
    }
    if (currentYear >= MAX_YEAR) updateYear(MIN_YEAR, 0);  // restart if at the end
    btn.html("&#10074;&#10074; Pause");
    playTimer = d3.interval(function() {
        if (currentYear >= MAX_YEAR) {                // reached the end -> stop
            playTimer.stop();
            playTimer = null;
            d3.select("#play-btn").html("&#9654; Play");
            return;
        }
        updateYear(currentYear + 1, 500);
    }, 750);
}

// wire up the shared time control (runs once after the first draw)
function setupControls() {
    d3.select("#year-slider")
        .attr("min", MIN_YEAR).attr("max", MAX_YEAR).attr("step", 1)
        .property("value", currentYear)
        .on("input", function() {
            if (playTimer) {                          // dragging stops playback
                playTimer.stop();
                playTimer = null;
                d3.select("#play-btn").html("&#9654; Play");
            }
            updateYear(+this.value, 0);
        });
    d3.select("#play-btn").on("click", togglePlay);
    d3.select("#year-label").text(currentYear);
}

// ---- guided tour (Martini Glass) -----------------------------------------

// stop any running playback (used when an act starts or the tour ends)
function stopPlay() {
    if (playTimer) {
        playTimer.stop();
        playTimer = null;
        d3.select("#play-btn").html("&#9654; Play");
    }
}

// move to act i: set year + selection, spotlight its view, update the card,
// and (for the lag act) auto-play the timeline so the lag is visible.
function gotoAct(i) {
    actIndex = Math.max(0, Math.min(ACTS.length - 1, i));
    const act = ACTS[actIndex];
    stopPlay();

    selectedM49 = act.select;          // null clears any prior highlight
    updateYear(act.year, 400);
    updateSelection();
    applyFocus(400);

    d3.select("#tour-step").text(`Act ${actIndex + 1} / ${ACTS.length}`);
    d3.select("#tour-title").text(act.title);
    d3.select("#tour-body").text(act.body);
    d3.select("#tour-prev").attr("disabled", actIndex === 0 ? true : null);
    d3.select("#tour-next").html(actIndex === ACTS.length - 1 ? "Explore freely &#8594;" : "Next &#8594;");

    if (act.play) {                    // Act 2: animate 1990 -> act.year to reveal the lag
        updateYear(MIN_YEAR, 0);
        applyFocus(0);
        playTimer = d3.interval(function() {
            if (currentYear >= act.year) { stopPlay(); return; }
            updateYear(currentYear + 1, 320);
        }, 360);
        d3.select("#play-btn").html("&#10074;&#10074; Pause");
    }
}

// enter free-exploration mode: hide the card, clear the spotlight, keep all views live
function endTour() {
    tourActive = false;
    stopPlay();
    d3.select("#tour").style("display", "none");
    d3.select(".tour-focus").remove();
    selectedM49 = null;        // clear the act's highlight so free exploration starts clean
    updateSelection();
}

// restart the guided tour from Act 1
function startTour() {
    tourActive = true;
    d3.select("#tour").style("display", "block");
    gotoAct(0);
}

function setupTour() {
    d3.select("#tour-prev").on("click", function() { gotoAct(actIndex - 1); });
    d3.select("#tour-next").on("click", function() {
        if (actIndex === ACTS.length - 1) endTour();
        else gotoAct(actIndex + 1);
    });
    d3.select("#tour-skip").on("click", endTour);
    d3.select("#replay-btn").on("click", startTour);
    gotoAct(0);                        // open on Act 1
}

// sequential color legend for the map (gradient bar + min/max labels), placed bottom-right
function drawMapLegend(mapG, innerH, mapW) {
    const legendWidth = 170, legendHeight = 9;
    // anchor at the map's bottom-right (over empty ocean) so it never collides with
    // the guided-tour card pinned to the viewport's bottom-left.
    const legendX = Math.max(6, mapW - (52 + legendWidth) - 6);
    const lg = mapG.append("g").attr("transform", `translate(${legendX}, ${innerH - 20})`);

    const grad = mapG.append("defs").append("linearGradient").attr("id", "legend-grad");
    d3.range(0, 1.01, 0.1).forEach(function(t) {
        grad.append("stop").attr("offset", (t * 100) + "%")
            .attr("stop-color", colorScale(Math.sqrt(colorMax) * t));
    });

    lg.append("text").attr("x", 0).attr("y", -4).attr("font-size", "10px").attr("fill", "#555")
        .text("Beef CH\u2084 (kt):");
    lg.append("rect").attr("x", 52).attr("width", legendWidth).attr("height", legendHeight)
        .attr("fill", "url(#legend-grad)").attr("stroke", "#ccc");
    lg.append("text").attr("x", 52).attr("y", legendHeight + 11)
        .attr("font-size", "9px").attr("fill", "#666").text("0");
    lg.append("text").attr("x", 52 + legendWidth).attr("y", legendHeight + 11).attr("text-anchor", "end")
        .attr("font-size", "9px").attr("fill", "#666").text(d3.format(",.0f")(colorMax));
}

// load world geometry + emissions + temperature data in parallel
Promise.all([
    d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"),
    d3.csv("data/cattle_beef_methane.csv"),
    d3.csv("data/temperature_change.csv")
]).then(function(results) {
    const world = results[0];
    const rows  = results[1];
    const tempRows = results[2];

    worldFeatures = topojson.feature(world, world.objects.countries).features;
    const validIds = new Set(worldFeatures.map(f => +f.id));   // country codes that exist on the map

    // FAO splits China into "China, mainland" (M49 156, matches the map) and an aggregate
    // "China" (M49 159 = mainland + Hong Kong + Macao + Taiwan, NOT a map id). We rely on the
    // validIds filter below to keep only codes that exist on the map: 156 joins China correctly,
    // while the 159 aggregate is dropped so it is NOT double-counted in the global total.

    // build year -> (m49 -> CH4 kt), country names, and the global yearly total
    ch4ByYear = new Map();
    countryName = new Map();
    ch4GlobalByYear = new Map();
    rows.forEach(function(r) {
        if (r.Element !== "Emissions (CH4)") return;           // CH4 only
        const m49  = +r["Area Code (M49)"];
        const year = +r.Year;
        const val  = +r.Value;
        if (!validIds.has(m49) || !Number.isFinite(val)) return;   // skip aggregates / bad rows
        if (!ch4ByYear.has(year)) ch4ByYear.set(year, new Map());
        ch4ByYear.get(year).set(m49, val);
        if (!countryName.has(m49)) countryName.set(m49, r.Area);
        ch4GlobalByYear.set(year, (ch4GlobalByYear.get(year) || 0) + val);  // global total = sum of countries
        if (val > colorMax) colorMax = val;                    // track single-country max for color domain
    });
    ch4GlobalByYear.forEach(function(v) { if (v > ch4GlobalMax) ch4GlobalMax = v; });
    colorScale.domain([0, Math.sqrt(colorMax)]);               // sqrt domain to reduce skew

    // temperature: World "Meteorological year" (7020) "Temperature change" (7271) anomaly series
    tempByYear = new Map();
    const worldRow = tempRows.find(r =>
        r.Area === "World" && r["Months Code"] === "7020" && r["Element Code"] === "7271");
    if (worldRow) {
        for (let y = 1961; y <= 2019; y++) {
            const cell = worldRow["Y" + y];
            const v = +cell;
            if (cell !== "" && Number.isFinite(v)) tempByYear.set(y, v);
        }
    }
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
        if (tempByYear.has(y) && tempByYear.get(y) > tempMax) tempMax = tempByYear.get(y);
    }

    console.log("years:", ch4ByYear.size, "colorMax:", colorMax,
        "ch4GlobalMax:", ch4GlobalMax, "tempMax:", tempMax, "tempWorldFound:", !!worldRow);

    draw();
    setupControls();
    setupTour();
}).catch(function(error) {
    console.log(error);
});

// redraw on resize (responsive, matches HW3 pattern)
window.addEventListener("resize", function() {
    if (worldFeatures && ch4ByYear) draw();
});
