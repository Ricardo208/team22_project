# Builds cattle_beef_methane.csv: beef-attributed cattle methane (kt CH4) per country/year.
#
# Method (disclosed approximation, see report):
#   beef_CH4(country,year) = cattle_CH4 (FAOSTAT GLE, "Livestock total (Emissions CH4)", FAO TIER 1)
#                            * beef_share, where
#   beef_share = beef_CO2eq / (beef_CO2eq + milk_CO2eq)   (FAOSTAT EI, "Emissions (CO2eq) (AR5)",
#                item 867 "Meat of cattle" vs 882 "Raw milk of cattle").
# Output columns match the original app CSV so main.js can load it as a drop-in:
#   "Area Code (M49)","Area","Element","Year","Value"   (Element fixed to "Emissions (CH4)").

$ErrorActionPreference = 'Stop'
$base = 'C:\Users\Soham\Documents\MAT108\ECS163\project\app\data'
$gle  = Import-Csv "$base\_gle_cattle_raw.csv"
$ei   = Import-Csv "$base\_ei\Environment_Emissions_intensities_E_All_Data_(Normalized).csv"

function M49Int($s) { [int]($s -replace '[^0-9]', '') }   # "'076" -> 76, "'356" -> 356

# --- cattle total methane per country/year (kt CH4) ---
$ch4   = @{}
$names = @{}
foreach ($r in $gle) {
    if ($r.Item -ne 'Cattle') { continue }
    if ($r.Element -ne 'Livestock total (Emissions CH4)') { continue }
    if ($r.Source -ne 'FAO TIER 1') { continue }            # drop UNFCCC duplicates
    $y = [int]$r.Year
    if ($y -lt 1990 -or $y -gt 2021) { continue }
    $id  = M49Int $r.'Area Code (M49)'
    $key = "$id|$y"
    $ch4[$key] = [double]$r.Value
    if (-not $names.ContainsKey($id)) { $names[$id] = $r.Area }
}

# --- beef & dairy emissions (CO2eq) per country/year, for the split ratio ---
$beef = @{}; $milk = @{}
foreach ($r in $ei) {
    if ($r.Element -ne 'Emissions (CO2eq) (AR5)') { continue }
    $ic = $r.'Item Code'
    if ($ic -ne '867' -and $ic -ne '882') { continue }
    $y = [int]$r.Year
    if ($y -lt 1990 -or $y -gt 2021) { continue }
    $key = "$(M49Int $r.'Area Code (M49)')|$y"
    $v = [double]$r.Value
    if ($ic -eq '867') { $beef[$key] = $v } else { $milk[$key] = $v }
}

# --- combine: beef-attributed methane ---
$out = New-Object System.Collections.Generic.List[object]
$skipped = 0
foreach ($key in $ch4.Keys) {
    $p = $key.Split('|'); $id = [int]$p[0]; $y = [int]$p[1]
    $b = if ($beef.ContainsKey($key)) { $beef[$key] } else { $null }
    $mk = if ($milk.ContainsKey($key)) { $milk[$key] } else { $null }
    if ($null -eq $b -and $null -eq $mk) { $skipped++; continue }   # no split available -> omit (grey on map)
    if ($null -eq $b) { $b = 0 }
    if ($null -eq $mk) { $mk = 0 }
    $den = $b + $mk
    if ($den -le 0) { $skipped++; continue }
    $share = $b / $den
    $val = [math]::Round($ch4[$key] * $share, 3)
    $out.Add([pscustomobject]@{
        'Area Code (M49)' = $id
        'Area'            = $names[$id]
        'Element'         = 'Emissions (CH4)'
        'Year'            = $y
        'Value'           = $val
    })
}

$out | Sort-Object 'Area Code (M49)', 'Year' |
    Export-Csv "$base\cattle_beef_methane.csv" -NoTypeInformation -Encoding UTF8

"rows written: $($out.Count)  (skipped, no beef/dairy split: $skipped)"
