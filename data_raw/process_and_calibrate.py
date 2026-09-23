import pandas as pd
import numpy as np
import json
import os

RAW = os.path.dirname(__file__)
OUT_DATA = os.path.join(RAW, "..", "data")
os.makedirs(OUT_DATA, exist_ok=True)

def load(series):
    df = pd.read_csv(os.path.join(RAW, f"{series}.csv"), parse_dates=["observation_date"])
    df = df.rename(columns={"observation_date": "date", series: "value"})
    df["value"] = pd.to_numeric(df["value"], errors="coerce")
    return df.set_index("date")["value"]

cpi = load("CPIAUCSL")
fedfunds = load("FEDFUNDS")
gs10 = load("GS10")
unrate = load("UNRATE")

df = pd.DataFrame({"cpi": cpi, "fedfunds": fedfunds, "gs10": gs10, "unrate": unrate}).dropna()
df["cpi_yoy"] = (df["cpi"] / df["cpi"].shift(12) - 1) * 100
df["real_rate"] = df["fedfunds"] - df["cpi_yoy"]
df["d_infl_1m"] = df["cpi_yoy"].diff(1)
df["d_unrate_1m"] = df["unrate"].diff(1)

# neutral real rate: long-run average real rate over full available window
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
    "gs10": df["gs10"],
    "fedfunds": df["fedfunds"],
    "cpi_yoy": df["cpi_yoy"],
}).dropna()
X = np.column_stack([reg3["fedfunds"], reg3["cpi_yoy"], np.ones(len(reg3))])
coef3, *_ = np.linalg.lstsq(X, reg3["gs10"], rcond=None)
w_fedfunds, w_cpi, c3 = coef3
pred3 = X @ coef3
resid3 = reg3["gs10"] - pred3
sigma3 = resid3.std()
r2_3 = 1 - resid3.var() / reg3["gs10"].var()

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

# --- Build historical game dataset (Volcker window with lead-in for YoY/lag calcs) ---
hist = df.loc["1979-01-01":"1984-01-01", ["cpi", "cpi_yoy", "fedfunds", "gs10", "unrate", "real_rate"]].copy()
hist = hist.round(4)
records = []
for date, row in hist.iterrows():
    records.append({
        "date": date.strftime("%Y-%m"),
        "cpi_index": row["cpi"],
        "cpi_yoy": row["cpi_yoy"],
        "fedfunds": row["fedfunds"],
        "gs10": row["gs10"],
        "unrate": row["unrate"],
        "real_rate": row["real_rate"],
    })

with open(os.path.join(OUT_DATA, "volcker_history.json"), "w") as f:
    json.dump(records, f, indent=2)

with open(os.path.join(OUT_DATA, "calibration.json"), "w") as f:
    json.dump(calibration, f, indent=2)

print(f"\nWrote {len(records)} months of history to data/volcker_history.json")
print("Wrote calibration.json")
