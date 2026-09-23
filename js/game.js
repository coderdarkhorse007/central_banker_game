const TOTAL_TURNS = 20; // 1979-Q1 (turn 0, setup) through 1983-Q4 (turn 20)

const QUARTER_MONTHS = ["01", "04", "07", "10"];

function buildQuarterDates() {
  const dates = [];
  for (let y = 1979; y <= 1983; y++) {
    for (const m of QUARTER_MONTHS) dates.push(`${y}-${m}`);
  }
  dates.push("1984-01"); // turn 20 endpoint, after 20 quarterly decisions
  return dates; // 21 entries, dates[0] = 1979-01 (starting point, turn 0)
}

const FLAVOR_EVENTS = {
  "1979-10": "Oct 1979: The Fed announces a shift to targeting bank reserves directly — markets nickname it the “Saturday Night Special.” Rates become far more volatile.",
  "1980-04": "Mar-Apr 1980: Credit controls on consumer borrowing trigger a sudden, sharp pullback in spending.",
  "1981-07": "Jul 1981: A recession officially begins as tight policy bites into output and hiring.",
  "1982-10": "Late 1982: Unemployment is approaching its worst levels since the Great Depression.",
  "1983-01": "Early 1983: Growth is turning up again as price pressures fade.",
};

function formatDateLabel(ym) {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

class Game {
  constructor(historyRecords) {
    this.quarterDates = buildQuarterDates();
    this.byMonth = {};
    historyRecords.forEach((r) => (this.byMonth[r.date] = r));

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
    const snap = this.state.advanceQuarter(targetRate, this.turn, formatDateLabel(dateKey));

    let text = this.proceduralCommentary(prevSnap, snap);
    if (FLAVOR_EVENTS[dateKey]) text = FLAVOR_EVENTS[dateKey] + " " + text;
    this.addNews(dateKey, text);

    if (this.turn >= TOTAL_TURNS) this.finished = true;
    return snap;
  }

  summarize() {
    const startRecord = this.byMonth[this.quarterDates[0]];
    const realEnd = this.byMonth[this.quarterDates[TOTAL_TURNS]];
    const playerEnd = this.state.history[this.state.history.length - 1];

    let excessUnemployment = 0;
    for (const snap of this.state.history) {
      excessUnemployment += Math.max(snap.unrate - ECONOMY_CONFIG.uNatural, 0);
    }
    excessUnemployment = excessUnemployment / this.state.history.length;

    let verdict, verdictClass;
    if (playerEnd.cpiYoy < 4 && excessUnemployment < 3) {
      verdict = "Excellent — inflation tamed with a comparatively soft landing.";
      verdictClass = "good";
    } else if (playerEnd.cpiYoy < 5) {
      verdict = "Success — inflation brought under control, at real economic cost.";
      verdictClass = "good";
    } else if (playerEnd.cpiYoy < 8) {
      verdict = "Mixed — inflation eased but remains uncomfortably high.";
      verdictClass = "warn";
    } else {
      verdict = "Failure — inflation was never brought under control.";
      verdictClass = "bad";
    }

    return {
      startCpi: startRecord.cpi_yoy,
      playerEndCpi: playerEnd.cpiYoy,
      playerEndUnrate: playerEnd.unrate,
      playerEndGs10: playerEnd.gs10,
      realEndCpi: realEnd.cpi_yoy,
      realEndUnrate: realEnd.unrate,
      realEndGs10: realEnd.gs10,
      avgExcessUnemployment: excessUnemployment,
      verdict,
      verdictClass,
    };
  }
}
