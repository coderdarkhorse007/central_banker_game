// Simplified illustrative macro model (Phillips curve + Okun's law toy model),
// hand-tuned for gameplay. Not a forecasting tool. 10Y yield weights are fitted
// via OLS regression on 1977-1985 FRED data (CPIAUCSL, FEDFUNDS, GS10, UNRATE).

const ECONOMY_CONFIG = {
  neutralRealRate: 3.56,   // long-run avg real fed funds rate, 1977-1985 (FRED)
  uNatural: 6.0,           // natural rate of unemployment for this scenario
  rho: 0.97,               // monthly persistence of the output gap
  kIS: 0.09,               // output gap sensitivity to real-rate gap
  kPI: 0.035,              // inflation sensitivity to output gap (Phillips curve)
  okunCoef: 0.5,           // unemployment points per point of output gap
  maxRateMovePerTurn: 3.0, // max |change| in fed funds rate per quarter (pp)
  minRate: 0.0,
  maxRate: 25.0,
  yield10y: {
    intercept: 6.79085,
    weightFedFunds: 0.61397,
    weightCpiYoy: -0.30477,
  },
};

class EconomyState {
  constructor(initial) {
    this.cpiYoy = initial.cpi_yoy;
    this.unrate = initial.unrate;
    this.fedfunds = initial.fedfunds;
    this.gs10 = initial.gs10;
    // derive latent output gap from starting unemployment via Okun's law
    this.outputGap = (ECONOMY_CONFIG.uNatural - this.unrate) / ECONOMY_CONFIG.okunCoef;
    this.history = [this.snapshot("1979-01", 0)];
  }

  snapshot(date, turn) {
    return {
      turn,
      date,
      cpiYoy: this.cpiYoy,
      unrate: this.unrate,
      fedfunds: this.fedfunds,
      gs10: this.gs10,
      outputGap: this.outputGap,
    };
  }

  // Advance one quarter (3 monthly sub-steps) holding fedfunds constant at targetRate.
  advanceQuarter(targetRate, turnIndex, dateLabel) {
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
      this.unrate = Math.min(Math.max(cfg.uNatural - cfg.okunCoef * this.outputGap, 1.0), 16);
    }

    this.gs10 =
      cfg.yield10y.intercept +
      cfg.yield10y.weightFedFunds * this.fedfunds +
      cfg.yield10y.weightCpiYoy * this.cpiYoy;
    this.gs10 = Math.max(this.gs10, 0.5);

    const snap = this.snapshot(dateLabel, turnIndex);
    this.history.push(snap);
    return snap;
  }
}
