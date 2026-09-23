# Central Banker: The Volcker Disinflation

A browser game that puts you at the helm of the Federal Reserve during 1979–1983,
the era of Paul Volcker's fight against double-digit inflation. Set the fed funds
rate every quarter and watch inflation, unemployment, and the 10-year Treasury
yield respond — then compare your path against what actually happened.

Play it live: *(add your GitHub Pages URL here once deployed)*

## How it works

- **Data**: Starting conditions and the "actual history" comparison line come from
  real FRED series (`CPIAUCSL`, `FEDFUNDS`, `GS10`, `UNRATE`), 1977–1985.
- **Simulation**: Turn-by-turn dynamics come from a simplified, hand-tuned
  Phillips-curve/Okun's-law toy model (`js/economy.js`) — not a forecast, and not
  fit directly to the historical data (a raw regression on this noisy 9-year
  window was uninformative, so the model uses standard textbook relationships
  with sensible signs and magnitudes instead). The 10-year yield response *is*
  fit via OLS regression on the FRED data (R² ≈ 0.71).
- **Visualization**: The "Economic System" panel is a WebGL scene (three.js)
  showing rate/inflation/yield/unemployment as connected, reactive nodes — styled
  in the spirit of NVIDIA Omniverse's connected-system visuals, but implemented
  natively in the browser so anyone can open the link with no install and no GPU
  streaming cost.

## Project structure

```
index.html            Page shell
css/style.css          Styling
js/economy.js          Simulation model (EconomyState, ECONOMY_CONFIG)
js/game.js              Turn/game-state management, scoring, news log
js/charts.js            Chart.js line charts (player path vs. history)
js/visualization.js     three.js "Economic System" scene
js/main.js              Wires everything to the DOM
data/volcker_history.json   Monthly FRED data, Jan 1979 – Jan 1984
data/calibration.json       Raw OLS regression output (reference only)
data_raw/                   Source CSVs + the Python script that builds data/
```

## Running locally

Data is loaded via `fetch()`, which browsers block on `file://` pages, so serve
the folder over HTTP:

```
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo settings, under **Pages**, set the source to the `main` branch,
   root folder.
3. Your game will be live at `https://<username>.github.io/<repo-name>/`.

No build step is required — it's static HTML/CSS/JS plus two CDN-hosted
libraries (Chart.js, three.js).

## Regenerating the data

If you want a different date range or additional FRED series, edit and rerun
`data_raw/process_and_calibrate.py` (requires `pandas` and `numpy`). It expects
the raw FRED CSVs (downloadable with no API key from
`https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES_ID>`) to already be
in `data_raw/`.
