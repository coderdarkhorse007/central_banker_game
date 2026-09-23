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
  // "The Pressure Index" — a fictional globally-traded commodity with its own
  // price index. Its quarterly return feeds straight into the headline/core
  // spread, exactly like a real-world supply shock: it moves headline
  // inflation without monetary policy having any direct control over it.
  pressureIndex: {
    startLevel: 100,
    quarterlyVolStd: 0.04,     // routine quarterly volatility (Gaussian, ~4% std dev)
    passThroughToSpread: 0.15, // pp added to the headline/core spread per 100% Pressure Index move
  },
  shockProbability: 0.20, // chance PER QUARTER that a random macro shock fires
  yieldShockDecay: 0.6,   // quarterly decay of a financial-stress yield premium
  unrateShockDecay: 0.5,  // quarterly decay of a labor-shock unemployment wedge
};

// Approximate standard normal via Box-Muller — used for the Pressure Index's
// routine quarterly noise (the discrete SHOCK_TYPES below layer larger, rarer
// moves on top of this).
function gaussianRandom() {
  const u = Math.max(Math.random(), 1e-9);
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A small table of one-off macro events. Each quarter there's a
// shockProbability chance that exactly one of these fires (weighted by
// `weight`), narrated in the news feed. Magnitudes are hand-tuned for
// gameplay drama, not fit to data — same spirit as the rest of this model.
const SHOCK_TYPES = [
  {
    key: "pressure_spike",
    weight: 3,
    apply: () => {
      const magnitude = 0.15 + Math.random() * 0.20; // +15% to +35%
      return {
        pressureIndexKick: magnitude,
        text: `The Pressure Index spikes ${(magnitude * 100).toFixed(0)}% on a sudden supply disruption — expect headline inflation to run hotter than core for a while.`,
      };
    },
  },
  {
    key: "pressure_crash",
    weight: 2,
    apply: () => {
      const magnitude = 0.15 + Math.random() * 0.20;
      return {
        pressureIndexKick: -magnitude,
        text: `The Pressure Index plunges ${(magnitude * 100).toFixed(0)}% as supply floods the market — headline inflation gets relief that core won't show.`,
      };
    },
  },
  {
    key: "demand_boom",
    weight: 2,
    apply: (state) => {
      const kick = 1.0 + Math.random() * 1.5;
      state.outputGap += kick;
      return { text: "A wave of unexpected demand hits the economy — spending picks up faster than anyone forecast." };
    },
  },
  {
    key: "demand_bust",
    weight: 2,
    apply: (state) => {
      const kick = 1.0 + Math.random() * 1.5;
      state.outputGap -= kick;
      return { text: "A sudden confidence shock hits spending — households and businesses pull back sharply." };
    },
  },
  {
    key: "financial_stress",
    weight: 2,
    apply: (state) => {
      const kick = 0.5 + Math.random() * 1.0;
      state.yieldShock += kick;
      return { text: "Financial markets wobble — investors demand a higher risk premium, pushing the 10-year yield up independent of the Fed." };
    },
  },
  {
    key: "labor_shock",
    weight: 2,
    apply: (state) => {
      const kick = 0.3 + Math.random() * 0.7;
      const sign = Math.random() < 0.5 ? -1 : 1;
      state.unrateShock += sign * kick;
      return sign > 0
        ? { text: "A wave of layoffs hits a major industry, pushing unemployment up." }
        : { text: "A hiring surge in a fast-growing sector pulls unemployment down." };
    },
  },
];

function pickWeightedShock() {
  const totalWeight = SHOCK_TYPES.reduce((sum, s) => sum + s.weight, 0);
  let r = Math.random() * totalWeight;
  for (const shock of SHOCK_TYPES) {
    r -= shock.weight;
    if (r <= 0) return shock;
  }
  return SHOCK_TYPES[SHOCK_TYPES.length - 1];
}

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
    this.pressureIndex = ECONOMY_CONFIG.pressureIndex.startLevel;
    this.pressureIndexReturn = 0;
    this.yieldShock = 0;
    this.unrateShock = 0;
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
      pressureIndex: this.pressureIndex,
      pressureIndexReturn: this.pressureIndexReturn,
      shockText: null,
    };
  }

  // Rolls the Pressure Index's quarterly return (routine noise, plus a
  // possible discrete shock) and applies whichever shock fired, if any.
  // Returns a news blurb describing the shock, or null if nothing happened.
  rollShocksAndPressureIndex() {
    const cfg = ECONOMY_CONFIG;
    let pressureIndexReturn = gaussianRandom() * cfg.pressureIndex.quarterlyVolStd;
    let shockText = null;

    if (Math.random() < cfg.shockProbability) {
      const shock = pickWeightedShock();
      const result = shock.apply(this);
      if (result.pressureIndexKick) pressureIndexReturn += result.pressureIndexKick;
      shockText = result.text;
    }

    this.pressureIndex = Math.max(this.pressureIndex * (1 + pressureIndexReturn), 1);
    this.pressureIndexReturn = pressureIndexReturn;
    this.spread += pressureIndexReturn * cfg.pressureIndex.passThroughToSpread * 100;

    return shockText;
  }

  // Advance one quarter (3 monthly sub-steps) holding fedfunds constant at
  // targetRate.
  advance(targetRate, turnIndex, dateLabel) {
    const cfg = ECONOMY_CONFIG;

    // Fade last quarter's shocks before possibly layering on a fresh one.
    this.yieldShock *= cfg.yieldShockDecay;
    this.unrateShock *= cfg.unrateShockDecay;
    const shockText = this.rollShocksAndPressureIndex();

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
      this.unrate = Math.min(Math.max(this.uNatural - cfg.okunCoef * this.outputGap + this.unrateShock, 1.0), 20);
      this.spread =
        cfg.spreadPersistence * this.spread +
        (1 - cfg.spreadPersistence) * cfg.avgHeadlineCoreSpread;
    }

    this.yield10y =
      cfg.yield10y.intercept +
      cfg.yield10y.weightFedFunds * this.fedfunds +
      cfg.yield10y.weightCpiYoy * this.cpiYoy +
      this.yieldShock;
    this.yield10y = Math.max(this.yield10y, 0.1);

    const snap = this.snapshot(dateLabel, turnIndex);
    snap.shockText = shockText;
    this.history.push(snap);
    return snap;
  }
}
