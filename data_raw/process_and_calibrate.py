import pandas as pd
import numpy as np
import json
import os

RAW = os.path.dirname(__file__)
OUT_DATA = os.path.join(RAW, "..", "data")
os.makedirs(OUT_DATA, exist_ok=True)

def load_monthly(series):
    df = pd.read_csv(os.path.join(RAW, f"{series}.csv"), parse_dates=["observation_date"])
    df = df.rename(columns={"observation_date": "date", series: "value"})
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    return df.set_index("date")["value"]

def load_daily_as_monthly(series):
    df = pd.read_csv(os.path.join(RAW, f"{series}.csv"), parse_dates=["observation_date"])
    df = df.rename(columns={"observation_date": "date", series: "value"})
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    df = df.set_index("date")["value"]
    monthly = df.resample("MS").mean()
    return monthly

cpi = load_monthly("CPIAUCSL")
cpi_core = load_monthly("CPILFESL")
fedfunds = load_monthly("FEDFUNDS")
yield10y = load_daily_as_monthly("DGS10")
unrate = load_monthly("UNRATE")

# Year-over-year and month-over-month changes MUST be computed on each series'
# own complete, gapless monthly index before merging — CPIAUCSL/CPILFESL have
# a real hole at 2025-10 (that month's release was delayed by the government
# shutdown), and merging+dropna() first would delete that row and silently
# shift every later .shift(12)/.diff(1) by one calendar month.
cpi_yoy = (cpi / cpi.shift(12) - 1) * 100
cpi_core_yoy = (cpi_core / cpi_core.shift(12) - 1) * 100
real_rate = fedfunds - cpi_yoy
d_infl_1m = cpi_yoy.diff(1)
d_unrate_1m = unrate.diff(1)

df = pd.DataFrame({
    "cpi": cpi,
    "cpi_core": cpi_core,
    "fedfunds": fedfunds,
    "yield10y": yield10y,
    "unrate": unrate,
    "cpi_yoy": cpi_yoy,
    "cpi_core_yoy": cpi_core_yoy,
    "real_rate": real_rate,
    "d_infl_1m": d_infl_1m,
    "d_unrate_1m": d_unrate_1m,
}).dropna()

# neutral real rate: long-run average real rate over the full available window
neutral_real_rate = df["real_rate"].mean()

# --- Calibration 1: inflation response to real rate, lagged 12 months ---
lag_infl = 12
reg1 = pd.DataFrame({
    "d_infl": df["d_infl_1m"],
    "real_rate_lag": df["real_rate"].shift(lag_infl),
}).dropna()
b1, a1 = np.polyfit(reg1["real_rate_lag"] - neutral_real_rate, reg1["d_infl"], 1)
resid1 = reg1["d_infl"] - (a1 + b1 * (reg1["real_rate_lag"] - neutral_real_rate))
sigma1 = resid1.std()
r2_1 = 1 - resid1.var() / reg1["d_infl"].var()

# --- Calibration 2: unemployment response to real rate, lagged 9 months ---
lag_unrate = 9
reg2 = pd.DataFrame({
    "d_unrate": df["d_unrate_1m"],
    "real_rate_lag": df["real_rate"].shift(lag_unrate),
}).dropna()
b2, a2 = np.polyfit(reg2["real_rate_lag"] - neutral_real_rate, reg2["d_unrate"], 1)
resid2 = reg2["d_unrate"] - (a2 + b2 * (reg2["real_rate_lag"] - neutral_real_rate))
sigma2 = resid2.std()
r2_2 = 1 - resid2.var() / reg2["d_unrate"].var()

# --- Calibration 3: 10Y yield as function of fed funds rate + trailing CPI YoY (contemporaneous) ---
reg3 = pd.DataFrame({
    "yield10y": df["yield10y"],
    "fedfunds": df["fedfunds"],
    "cpi_yoy": df["cpi_yoy"],
}).dropna()
X = np.column_stack([reg3["fedfunds"], reg3["cpi_yoy"], np.ones(len(reg3))])
coef3, *_ = np.linalg.lstsq(X, reg3["yield10y"], rcond=None)
w_fedfunds, w_cpi, c3 = coef3
pred3 = X @ coef3
resid3 = reg3["yield10y"] - pred3
sigma3 = resid3.std()
r2_3 = 1 - resid3.var() / reg3["yield10y"].var()

calibration = {
    "neutral_real_rate": round(float(neutral_real_rate), 4),
    "inflation_model": {
        "lag_months": lag_infl,
        "intercept": round(float(a1), 5),
        "slope_vs_real_rate_gap": round(float(b1), 5),
        "noise_std": round(float(sigma1), 5),
        "r_squared": round(float(r2_1), 4),
    },
    "unemployment_model": {
        "lag_months": lag_unrate,
        "intercept": round(float(a2), 5),
        "slope_vs_real_rate_gap": round(float(b2), 5),
        "noise_std": round(float(sigma2), 5),
        "r_squared": round(float(r2_2), 4),
    },
    "yield10y_model": {
        "weight_fedfunds": round(float(w_fedfunds), 5),
        "weight_cpi_yoy": round(float(w_cpi), 5),
        "intercept": round(float(c3), 5),
        "noise_std": round(float(sigma3), 5),
        "r_squared": round(float(r2_3), 4),
    },
}

print(json.dumps(calibration, indent=2))

# --- Build full historical game dataset, entire common range across all 5 series ---
# (cpi_yoy/cpi_core_yoy are NaN for the first 12 months of the merged window, since
# they need a year-ago value; drop those rows rather than emit NaN into the JSON)
hist = df[["cpi", "cpi_yoy", "cpi_core", "cpi_core_yoy", "fedfunds", "yield10y", "unrate", "real_rate"]].dropna().copy()
hist = hist.round(4)
records = []
for date, row in hist.iterrows():
    records.append({
        "date": date.strftime("%Y-%m"),
        "cpi_index": row["cpi"],
        "cpi_yoy": row["cpi_yoy"],
        "cpi_core_index": row["cpi_core"],
        "cpi_core_yoy": row["cpi_core_yoy"],
        "fedfunds": row["fedfunds"],
        "yield10y": row["yield10y"],
        "unrate": row["unrate"],
        "real_rate": row["real_rate"],
    })

with open(os.path.join(OUT_DATA, "full_history.json"), "w") as f:
    json.dump(records, f, indent=2)

with open(os.path.join(OUT_DATA, "calibration.json"), "w") as f:
    json.dump(calibration, f, indent=2)

print(f"\nWrote {len(records)} months of history to data/full_history.json ({records[0]['date']} - {records[-1]['date']})")
print("Wrote calibration.json")
