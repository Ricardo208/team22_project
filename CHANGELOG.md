# Changelog — The Cattle-Climate Feedback Loop

## [Unreleased] — 2026-06-04 — Beef-attribution pivot, narrative rewrite, full QA

### Why
The previous build shaded the map by **all-agriculture methane** (FAOSTAT item
"Emissions on agricultural land" = livestock + rice + manure). That metric cannot
isolate cattle, so the "cattle/beef" story was not actually supported by the data —
e.g. India ranked #1 mostly because of rice and dairy/draught buffalo, not beef.

### Changed — data
- **New metric: beef-attributed cattle methane.** Added `data/build_beef_methane.ps1`,
  which produces `data/cattle_beef_methane.csv` (1990–2021, kt CH4).
  - Cattle CH4 from FAOSTAT **GLE** ("Emissions from livestock", element
    "Livestock total (Emissions CH4)", item Cattle, source FAO TIER 1).
  - Split into a **beef share** using FAOSTAT **EI** ("Emissions intensities",
    CO2eq of "Meat of cattle" vs "Raw milk of cattle").
  - `beef_CH4 = cattle_CH4 × beef_CO2eq / (beef_CO2eq + milk_CO2eq)`.
  - Output columns match the original app CSV, so it is a drop-in for the loader.
- The beef share is a **disclosed estimate** (FAO does not publish beef-only methane).

### Changed — visualization (`main.js`)
- Loader now reads `data/cattle_beef_methane.csv`.
- Map, bar chart, lag chart, legend, tooltip, and subtitle relabeled to
  **beef-attributed methane**; added an on-screen methods/source disclosure.
- Act-4 highlight switched from India to **Brazil** (the largest beef-methane emitter);
  removed the now-unused `USA_M49` constant.

### Changed — narrative (5 acts, now cohesive: cause → why hidden → stakes → where → your role)
1. **The Hidden Connection** — beef → methane; introduces the map.
2. **The Lag** — warming follows emissions by years.
3. **The Wrong Direction** — *replaces the old "Acceleration" act*, which the new data
   disproved (beef methane grew ~29% since 1990 but **decelerated**). Now grounded in
   research: methane ≈30% of warming since pre-industrial (UNEP); must fall 40–45% by
   2030 (IPCC/FAO); enteric fermentation is the largest farm-methane source (FAO).
4. **The Beef Frontier** — Brazil leads; India ranks low because its cattle are dairy/draught.
5. **The Power on Your Plate** — *replaces the old AgSTAR biogas act*, which only fits
   dairy manure, not grazing-beef enteric methane. Now a demand-side call to action:
   beef has the highest methane footprint per gram protein (Poore & Nemecek 2018);
   methane is short-lived so cutting it cools fast (IPCC/UNEP); enteric methane cannot
   be captured, so lower demand is the most direct lever.

### Verified
- Full Puppeteer QA pass (40+ checks, zero console errors): D3 geo/scales/axes/line/
  enter-update-exit/transitions/legend/tooltip; shared slider + play drive all three
  views; linked map↔bar selection; Martini Glass acts, spotlight, autoplay, and
  free-exploration unlock; data integrity (32 years, temp n/a for 2020–21, no NaN);
  responsive resize; consistent country color across views.

### Housekeeping
- Added `.gitignore` excluding the bulky raw FAOSTAT downloads (`data/_gle/`,
  `data/_ei/`, and their zips). These are kept locally for report documentation and
  are re-downloadable from FAOSTAT bulk (see the build script header).

### Still to do (future session)
- Update the **report text** (India→Brazil numbers, datasets/method section for GLE+EI,
  the "2–3× temperature impact" claim that the viz does not actually show, OWID validation).
- Optional polish: widen the truncated "United States…" bar label; color-blind palette
  check; background-click-to-deselect.
