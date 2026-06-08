# build_beef_methane.py
# Splits FAOSTAT cattle CH4 into beef vs dairy using the beef/milk CO2eq ratio.
# makes cattle_beef_methane.csv 

import csv
import os
import re

# base folder = wherever this script lives, so no path editing needed
base = os.path.dirname(os.path.abspath(__file__))
gle_path = os.path.join(base, "_gle_cattle_raw.csv")
ei_path  = os.path.join(base, "_ei", "Environment_Emissions_intensities_E_All_Data_(Normalized).csv")

# strip anything that is not a digit and turn the M49 code into an int
def m49_int(s):
    return int(re.sub(r"[^0-9]", "", s))

# cattle CH4 per country/year
ch4   = {}
names = {}
with open(gle_path, newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        if r["Item"] != "Cattle": continue
        if r["Element"] != "Livestock total (Emissions CH4)": continue
        if r["Source"] != "FAO TIER 1": continue
        y = int(r["Year"])
        if y < 1990 or y > 2021: continue
        cid = m49_int(r["Area Code (M49)"])
        ch4[(cid, y)] = float(r["Value"])
        names.setdefault(cid, r["Area"])  # keep the first name we see

# beef & dairy CO2eq for the split ratio
beef = {}
milk = {}
with open(ei_path, newline="", encoding="utf-8-sig") as f:
    for r in csv.DictReader(f):
        if r["Element"] != "Emissions (CO2eq) (AR5)": continue
        ic = r["Item Code"]
        if ic != "867" and ic != "882": continue  # 867 = meat of cattle, 882 = raw milk
        y = int(r["Year"])
        if y < 1990 or y > 2021: continue
        key = (m49_int(r["Area Code (M49)"]), y)
        if ic == "867":
            beef[key] = float(r["Value"])
        else:
            milk[key] = float(r["Value"])

# combine: beef-attributed CH4
out = []
skipped = 0
for key, ch4_val in ch4.items():
    cid, y = key
    b  = beef.get(key)
    mk = milk.get(key)
    if b is None and mk is None:  # no ratio to split on, drop it
        skipped += 1
        continue
    if b  is None: b  = 0
    if mk is None: mk = 0
    den = b + mk
    if den <= 0:
        skipped += 1
        continue
    share = b / den
    val = round(ch4_val * share, 3)
    if val == int(val): val = int(val)  # write whole numbers without a trailing .0
    out.append({
        "Area Code (M49)": cid,
        "Area":            names[cid],
        "Element":         "Emissions (CH4)",
        "Year":            y,
        "Value":           val,
    })

# sort by country then year so the output is stable
out.sort(key=lambda row: (row["Area Code (M49)"], row["Year"]))

# formatting 
out_path = os.path.join(base, "cattle_beef_methane.csv")
with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=["Area Code (M49)", "Area", "Element", "Year", "Value"],
                            quoting=csv.QUOTE_ALL)
    writer.writeheader()
    writer.writerows(out)

print(f"rows written: {len(out)}  (skipped, no beef/dairy split: {skipped})")
