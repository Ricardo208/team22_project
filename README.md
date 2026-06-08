# The Cattle-Climate Feedback Loop

Team 22. Soham Gaikwad, Oseghale Obho, Visshva Anto, Ricardo Pelayo.

An interactive narrative visualization that shows how beef-attributed cattle methane drives global warming. It is built with D3 v5 and runs in the browser.

## Description

The repository holds a single-page D3 application and the data it reads. There are three source files in the repository along with a `data` folder.

- `index.html` builds the page layout and loads D3 v5 and topojson-client from a CDN.
- `main.js` holds all of the visualization logic. It loads the data, builds the three coordinated views, drives them from one shared time slider, and runs the five act guided tour.
- `data/` holds the processed dataset the app reads, the source files, and the build script used to create it.

The application shows three coordinated views in one responsive layout. A choropleth world map shades each country by its beef methane. A dual axis line chart plots global beef methane against the global temperature anomaly to reveal the lag between them. A horizontal bar chart ranks the top ten emitters for the selected year. One time slider with a play control drives all three views at once. Clicking a country highlights it in the map and the bar chart together. A five act guided tour walks a first time reader through the story before the dashboard unlocks for free exploration.

The app reads two files from `data/` at runtime.

- `cattle_beef_methane.csv` is the processed dataset. It holds annual country level beef methane from 1990 to 2021.
- `temperature_change.csv` is the FAO global surface temperature anomaly from 1961 to 2019.

The country geometry is loaded at runtime from the world-atlas CDN, so no geometry file is stored in the repository.

## Installation

The app is static and needs no build step and no package install. You need Python to serve the files and a modern web browser. D3, topojson-client, and the map geometry load from a CDN, so an internet connection is required.

1. Clone the repository.
2. Open code in your editor.

The dataset the app reads is already committed in `data/`, so no dataset fetching is needed to run the demo. Fetching the raw FAO source data is only needed to rebuild the dataset from scratch, which is covered under Reproducibility below.

## Execution

Serve the `app` folder over a local web server and open it in the browser. The app must be served over http rather than opened from the file system, because it loads the data with fetch.

```
cd app
python -m http.server 8000
```

Then open `http://localhost:8000` in the browser. The guided tour starts on load. Use Next and Back to move through the five acts, or use Skip tour to go straight to free exploration. The time slider and the play button drive all three views. Click any country to highlight it across views. The Replay tour button restarts the sequence at any time.

## Reproducibility

The processed `cattle_beef_methane.csv` is built from two FAOSTAT bulk datasets by `data/build_beef_methane.py`. The raw source files are large and are not committed. They are listed in `.gitignore`. The script estimates beef methane with the formula `beef_CH4 = cattle_CH4 * beef_CO2eq / (beef_CO2eq + milk_CO2eq)`. It uses only the Python standard library, so no package install is needed.

To rebuild the dataset from scratch, follow these steps.

1. Download the FAOSTAT "Emissions from Livestock" (GLE) bulk file and filter it to cattle methane. Keep the rows where Item is `Cattle`, Element is `Livestock total (Emissions CH4)`, and Source is `FAO TIER 1`. Save this as `data/_gle_cattle_raw.csv`.
2. Download the FAOSTAT "Emissions Intensities" (EI) bulk file and extract it to `data/_ei/`. The script reads `Environment_Emissions_intensities_E_All_Data_(Normalized).csv` and uses item code 867 for beef and item code 882 for milk under the element `Emissions (CO2eq) (AR5)`.
3. Run the script with Python. It finds its own folder, so no path editing is needed.

```
cd app/data
python build_beef_methane.py
```

The script writes `cattle_beef_methane.csv` with columns that match what the app expects, so the rebuilt file is a drop-in replacement. It prints the row count and the number of country year records skipped for having no beef or dairy split.
