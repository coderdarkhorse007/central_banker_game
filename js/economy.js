// Simplified illustrative macro model (Phillips curve + Okun's law toy model),
// hand-tuned for gameplay. Not a forecasting tool. 10Y yield weights are fitted
// via OLS regression on 1962-present FRED data (CPIAUCSL, CPILFESL, FEDFUNDS,
// DGS10, UNRATE).

const ECONOMY_CONFIG = {
  neutralRealRate: 1.03,  // long-run avg real fed funds rate, 1962-present (FRED)
  rho: 0.97,              // monthly persistence of the output gap
  kIS: 0.09,              // output gap sensitivity to real-rate gap
  kPI: 0.035,             // inflation sensitivity to output gap (Phillips curve)
  okunCoef: 0.5,          // unemployment points per point of output gap
  maxRateMovePerTurn: 3.0, // max |change| in fed funds rate per quarter (pp)
  minRate: 0.0,
  maxRate: 25.0,
  yield10y: {
    intercept: 2.36294,
    weightFedFunds: 0.75837,
    weightCpiYoy: -0.05949,
  },
  // Core CPI is modeled as headline minus a food/energy "spread" that starts
  // at whatever it actually was on the real starting month, then drifts back
  // toward its long-run historical average — since interest rates don't
  // directly move global food/energy prices, only underlying demand (which
  // both headline and core share via the same output gap).
  avgHeadlineCoreSpread: 0.0424, // long-run avg of (headline YoY - core YoY), 1962-present (FRED)
  spreadPersistence: 0.97,       // monthly persistence of the spread, same cadence as the output gap
};

class EconomyState {
  constructor(initial) {
    this.cpiYoy = initial.cpi_yoy;
    this.unrate = initial.unrate;
    this.fedfunds = initial.fedfunds;
    this.yield10y = initial.yield10y;
    // The natural rate of unemployment is pinned to wherever the chosen
    // playthrough starts (assume the economy begins near full employment),
    // so the model is usable for any historical starting point, not just 1979.
    this.uNatural = initial.unrate;
    this.outputGap = 0;
    this.spread = initial.cpi_yoy - initial.cpi_core_yoy;
    this.history = [this.snapshot(initial.date, 0)];
  }

  get coreCpiYoy() {
    return this.cpiYoy - this.spread;
  }

  snapshot(date, turn) {
    return {
      turn,
      date,
      cpiYoy: this.cpiYoy,
      coreCpiYoy: this.coreCpiYoy,
      unrate: this.unrate,
      fedfunds: this.fedfunds,
      yield10y: this.yield10y,
      outputGap: this.outputGap,
    };
  }

  // Advance one quarter (3 monthly sub-steps) holding fedfunds constant at
  // targetRate.
  advance(targetRate, turnIndex, dateLabel) {
    const cfg = ECONOMY_CONFIG;
    const prevRate = this.fedfunds;
    const clampedTarget = Math.min(
      Math.max(targetRate, prevRate - cfg.maxRateMovePerTurn),
      prevRate + cfg.maxRateMovePerTurn
    );
    const rate = Math.min(Math.max(clampedTarget, cfg.minRate), cfg.maxRate);
    this.fedfunds = rate;

    for (let m = 0; m < 3; m++) {
      const realRate = this.fedfunds - this.cpiYoy;
      const realRateGap = realRate - cfg.neutralRealRate;

      this.outputGap = cfg.rho * this.outputGap - cfg.kIS * realRateGap;
      this.outputGap = Math.min(Math.max(this.outputGap, -10), 10); // plausibility clamp
      this.cpiYoy = this.cpiYoy + cfg.kPI * this.outputGap;
      this.cpiYoy = Math.min(Math.max(this.cpiYoy, -2), 30); // clamp deflation/hyperinflation extremes
      this.unrate = Math.min(Math.max(this.uNatural - cfg.okunCoef * this.outputGap, 1.0), 20);
      this.spread =
        cfg.spreadPersistence * this.spread +
        (1 - cfg.spreadPersistence) * cfg.avgHeadlineCoreSpread;
    }

    this.yield10y =
      cfg.yield10y.intercept +
      cfg.yield10y.weightFedFunds * this.fedfunds +
      cfg.yield10y.weightCpiYoy * this.cpiYoy;
    this.yield10y = Math.max(this.yield10y, 0.1);

    const snap = this.snapshot(dateLabel, turnIndex);
    this.history.push(snap);
    return snap;
  }
}
