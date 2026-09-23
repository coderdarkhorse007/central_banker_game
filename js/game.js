const TURN_LENGTH_MONTHS = 3; // each turn is one quarter

// Every month present in the dataset, in order. The start-month slider in
// main.js indexes into this array — any real month can be chosen as a start,
// including the most recently published one.
function getAllDates(historyRecords) {
  return historyRecords.map((r) => r.date);
}

// Calendar month arithmetic on "YYYY-MM" strings — used to project turn dates
// forward even past the edge of the dataset, since a term that starts near
// the present necessarily runs into months FRED hasn't published yet.
function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const newY = Math.floor(total / 12);
  const newM = (total % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

// One turn date per quarter, starting at startDate, for termQuarters turns —
// computed by calendar arithmetic so it always hits exactly termQuarters
// turns even when that runs past the last real month in the dataset.
function buildTurnDates(startDate, termQuarters) {
  const dates = [];
  for (let i = 0; i <= termQuarters; i++) {
    dates.push(addMonths(startDate, i * TURN_LENGTH_MONTHS));
  }
  return dates;
}

const FLAVOR_EVENTS = {
  "1979-10": "Oct 1979: The Fed announces a shift to targeting bank reserves directly — markets nickname it the “Saturday Night Special.” Rates become far more volatile.",
  "1980-04": "Mar-Apr 1980: Credit controls on consumer borrowing trigger a sudden, sharp pullback in spending.",
  "1981-07": "Jul 1981: A recession officially begins as tight policy bites into output and hiring.",
  "1982-10": "Late 1982: Unemployment is approaching its worst levels since the Great Depression.",
  "1983-01": "Early 1983: Growth is turning up again as price pressures fade.",
  "2001-01": "Jan 2001: The dot-com bust is dragging on growth; the Fed begins cutting rates aggressively.",
  "2007-10": "Late 2007: Cracks are showing in mortgage markets as home prices roll over.",
  "2008-10": "Oct 2008: A full-blown financial crisis is underway after a major investment bank's collapse.",
  "2020-04": "Apr 2020: A pandemic shutdown has thrown tens of millions out of work almost overnight.",
  "2021-04": "Spring 2021: Prices are picking up as reopening demand collides with strained supply chains.",
  "2022-04": "Spring 2022: Inflation is running at its hottest pace in four decades.",
  "2023-04": "Spring 2023: Regional bank failures test confidence even as the Fed keeps rates high.",
};

function formatDateLabel(ym) {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

class Game {
  constructor(historyRecords, startDate, termQuarters) {
    this.byMonth = {};
    historyRecords.forEach((r) => (this.byMonth[r.date] = r));
    this.latestRealDate = historyRecords[historyRecords.length - 1].date;

    this.quarterDates = buildTurnDates(startDate, termQuarters);
    this.totalTurns = termQuarters;

    const initial = this.byMonth[this.quarterDates[0]];
    this.state = new EconomyState(initial);
    this.turn = 0;
    this.pendingRate = initial.fedfunds;
    this.newsLog = [];
    this.finished = false;

    this.addNews(this.quarterDates[0], `Term begins. Inflation is running at ${initial.cpi_yoy.toFixed(1)}% year-over-year; you inherit a fed funds rate of ${initial.fedfunds.toFixed(2)}%.`);
  }

  get currentDateLabel() {
    return formatDateLabel(this.quarterDates[this.turn]);
  }

  get endDateLabel() {
    return formatDateLabel(this.quarterDates[this.totalTurns]);
  }

  // undefined once the playthrough runs past the last month FRED has
  // published — there's simply no "actual history" to compare against yet.
  get realHistoryAtCurrentTurn() {
    return this.byMonth[this.quarterDates[this.turn]];
  }

  addNews(dateKey, text) {
    this.newsLog.unshift({ date: formatDateLabel(dateKey), text });
  }

  proceduralCommentary(prevSnap, snap) {
    const lines = [];
    const dInfl = snap.cpiYoy - prevSnap.cpiYoy;
    const dUn = snap.unrate - prevSnap.unrate;
    if (dInfl <= -0.8) lines.push("Inflation is cooling noticeably.");
    else if (dInfl >= 0.8) lines.push("Price pressures are picking back up.");
    if (dUn >= 0.6) lines.push("Layoffs are mounting as the labor market weakens.");
    else if (dUn <= -0.6) lines.push("Hiring is picking up as the economy strengthens.");
    if (snap.fedfunds >= 18) lines.push("Borrowing costs are at levels businesses call punishing.");
    if (snap.unrate >= 10) lines.push("Unemployment has reached levels not seen in generations.");
    if (lines.length === 0) lines.push("Conditions are little changed this quarter.");
    return lines.join(" ");
  }

  advanceTurn(targetRate) {
    if (this.finished) return null;
    const prevSnap = this.state.snapshot(this.currentDateLabel, this.turn);
    this.turn += 1;
    const dateKey = this.quarterDates[this.turn];
    const snap = this.state.advance(targetRate, this.turn, formatDateLabel(dateKey));

    let text = this.proceduralCommentary(prevSnap, snap);
    if (FLAVOR_EVENTS[dateKey]) text = FLAVOR_EVENTS[dateKey] + " " + text;
    this.addNews(dateKey, text);

    if (this.turn >= this.totalTurns) this.finished = true;
    return snap;
  }

  summarize() {
    const startRecord = this.byMonth[this.quarterDates[0]];
    const realEnd = this.byMonth[this.quarterDates[this.totalTurns]];
    const playerEnd = this.state.history[this.state.history.length - 1];

    let excessUnemployment = 0;
    for (const snap of this.state.history) {
      excessUnemployment += Math.max(snap.unrate - this.state.uNatural, 0);
    }
    excessUnemployment = excessUnemployment / this.state.history.length;

    let verdict, verdictClass;
    const cpiDrop = startRecord.cpi_yoy - playerEnd.cpiYoy;
    if (playerEnd.cpiYoy < 3 && excessUnemployment < 2) {
      verdict = "Excellent — inflation tamed with a comparatively soft landing.";
      verdictClass = "good";
    } else if (playerEnd.cpiYoy < startRecord.cpi_yoy || playerEnd.cpiYoy < 4) {
      verdict = "Success — inflation brought under control, at real economic cost.";
      verdictClass = "good";
    } else if (cpiDrop > -2) {
      verdict = "Mixed — inflation eased or held steady but remains uncomfortable.";
      verdictClass = "warn";
    } else {
      verdict = "Failure — inflation was never brought under control.";
      verdictClass = "bad";
    }

    return {
      startCpi: startRecord.cpi_yoy,
      playerEndCpi: playerEnd.cpiYoy,
      playerEndUnrate: playerEnd.unrate,
      playerEndYield10y: playerEnd.yield10y,
      hasRealEnd: !!realEnd,
      realEndCpi: realEnd ? realEnd.cpi_yoy : null,
      realEndUnrate: realEnd ? realEnd.unrate : null,
      realEndYield10y: realEnd ? realEnd.yield10y : null,
      latestRealDateLabel: formatDateLabel(this.latestRealDate),
      avgExcessUnemployment: excessUnemployment,
      verdict,
      verdictClass,
    };
  }
}
