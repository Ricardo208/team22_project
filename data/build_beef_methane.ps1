# build_beef_methane.ps1
# Splits FAOSTAT cattle CH4 into beef vs dairy using the beef/milk CO2eq ratio.
# Output: cattle_beef_methane.csv (columns match the original CSV for drop-in loading)

$ErrorActionPreference = 'Stop'
$base = 'C:\Users\Soham\Documents\MAT108\ECS163\project\app\data'
$gle  = Import-Csv "$base\_gle_cattle_raw.csv"
$ei   = Import-Csv "$base\_ei\Environment_Emissions_intensities_E_All_Data_(Normalized).csv"

function M49Int($s) { [int]($s -replace '[^0-9]', '') }

# cattle CH4 per country/year
$ch4   = @{}
$names = @{}
foreach ($r in $gle) {
    if ($r.Item -ne 'Cattle') { continue }
    if ($r.Element -ne 'Livestock total (Emissions CH4)') { continue }
    if ($r.Source -ne 'FAO TIER 1') { continue }
    $y = [int]$r.Year
    if ($y -lt 1990 -or $y -gt 2021) { continue }
    $id  = M49Int $r.'Area Code (M49)'
    $key = "$id|$y"
    $ch4[$key] = [double]$r.Value
    if (-not $names.ContainsKey($id)) { $names[$id] = $r.Area }
}

# beef & dairy CO2eq for the split ratio
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

# combine: beef-attributed CH4
$out = New-Object System.Collections.Generic.List[object]
$skipped = 0
foreach ($key in $ch4.Keys) {
    $p = $key.Split('|'); $id = [int]$p[0]; $y = [int]$p[1]
    $b = if ($beef.ContainsKey($key)) { $beef[$key] } else { $null }
    $mk = if ($milk.ContainsKey($key)) { $milk[$key] } else { $null }
    if ($null -eq $b -and $null -eq $mk) { $skipped++; continue }
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
