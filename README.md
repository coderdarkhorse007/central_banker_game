# Central Banker

A browser game that puts you at the helm of the Federal Reserve for any period of
history you pick — from the Volcker disinflation of 1979–83 to today's Fed. Pick a
term length (1 to 5 years) and a starting month, set the fed funds rate every
quarter, and watch inflation, unemployment, and the 10-year Treasury yield
respond — then compare your path against what actually happened. A one-click
preset replays the full 5-year Volcker disinflation.

Play it live: *(add your GitHub Pages URL here once deployed)*

## How it works

- **Data**: Starting conditions and the "actual history" comparison lines come
  from real FRED series — `CPIAUCSL` (headline CPI), `CPILFESL` (core CPI, ex
  food & energy), `FEDFUNDS`, `DGS10` (10-year Treasury yield, resampled from
  daily to monthly averages), and `UNRATE` — covering Jan 1962 through the most
  recently published month. The picker lets you choose a 1–5 year term starting
  from any month in that window, including the most recent one — turns past the
  latest published month simply have no "actual history" to compare against yet.
- **Simulation**: Turn-by-turn dynamics come from a simplified, hand-tuned
  Phillips-curve/Okun's-law toy model (`js/economy.js`) — not a forecast, and not
  fit directly to the historical data (a raw regression on this noisy window
  was uninformative, so the model uses standard textbook relationships with
  sensible signs and magnitudes instead). The natural rate of unemployment is
  pinned to whatever the actual unemployment rate was on the quarter you start,
  so the model behaves reasonably regardless of which era you pick. The 10-year
  yield response *is* fit via OLS regression on the full FRED window (R² ≈ 0.81).
  Both headline and core CPI are simulated for "your path": core is modeled as
  headline minus a food/energy "spread" that starts at its real observed value
  and drifts back toward its long-run historical average.
- **Market X**: a fictional commodity index with no real FRED counterpart. It
  drifts on its own each quarter and feeds directly into the headline/core
  spread — exactly like a real-world supply shock, it moves headline inflation
  without the Fed having any direct control over it.
- **Random shocks**: each quarter there's roughly a 1-in-5 chance of a
  macro event firing — a Market X spike/crash, a demand boom/bust, a
  financial-stress yield spike, or a labor-market shock — narrated in the
  Briefing panel. Effects decay over the following quarters rather than
  resetting instantly.
- **Visualization**: The "Economic System" panel is a WebGL scene (three.js)
  showing rate/inflation/yield/unemployment/Market X as connected, reactive
  nodes — styled in the spirit of NVIDIA Omniverse's connected-system visuals,
  but implemented natively in the browser so anyone can open the link with no
  install and no GPU streaming cost.

## Project structure

```
index.html            Page shell, including the date-range picker
css/style.css          Styling
js/economy.js          Simulation model (EconomyState, ECONOMY_CONFIG)
js/game.js              Turn/game-state management, scoring, news log, date-range handling
js/charts.js            Chart.js line charts (player path vs. history)
js/visualization.js     three.js "Economic System" scene
js/main.js              Wires everything to the DOM, including the range picker
data/full_history.json      Monthly FRED data, Jan 1962 – present
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
