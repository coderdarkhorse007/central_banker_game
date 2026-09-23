let game, chartSet, viz, historyRecords, allDates, termQuarters;

const DEFAULT_START = "1979-01";
const DEFAULT_TERM_QUARTERS = 8; // 2 years

const el = (id) => document.getElementById(id);

async function loadHistory() {
  const res = await fetch("data/full_history.json");
  return res.json();
}

function fmtPct(v) {
  return `${v.toFixed(2)}%`;
}

function refreshStats() {
  const snap = game.state.history[game.state.history.length - 1];
  const real = game.realHistoryAtCurrentTurn; // undefined once past the latest published FRED month

  el("stat-cpi").textContent = fmtPct(snap.cpiYoy);
  el("stat-cpi-core").textContent = fmtPct(snap.coreCpiYoy);
  el("stat-fedfunds").textContent = fmtPct(snap.fedfunds);
  el("stat-yield10y").textContent = fmtPct(snap.yield10y);
  el("stat-unrate").textContent = fmtPct(snap.unrate);
  el("stat-marketx").textContent = snap.marketX.toFixed(1);

  const ghostText = (key) => (real ? `history: ${fmtPct(real[key])}` : `history: not yet reported`);
  el("stat-cpi-ghost").textContent = ghostText("cpi_yoy");
  el("stat-cpi-core-ghost").textContent = ghostText("cpi_core_yoy");
  el("stat-fedfunds-ghost").textContent = ghostText("fedfunds");
  el("stat-yield10y-ghost").textContent = ghostText("yield10y");
  el("stat-unrate-ghost").textContent = ghostText("unrate");
  const marketXReturnPct = snap.marketXReturn * 100;
  el("stat-marketx-ghost").textContent = `this quarter: ${marketXReturnPct >= 0 ? "+" : ""}${marketXReturnPct.toFixed(1)}%`;

  el("turn-counter").textContent = `${game.turn} / ${game.totalTurns}`;
  el("date-readout").textContent = game.currentDateLabel;
}

function refreshNews() {
  const container = el("news-log");
  container.innerHTML = game.newsLog
    .map((n) => `<p><span class="news-date">${n.date}</span>${n.text}</p>`)
    .join("");
}

function refreshSlider() {
  const rate = game.state.fedfunds;
  el("rate-slider").value = rate;
  el("rate-slider-readout").textContent = rate.toFixed(2);
  game.pendingRate = rate;
}

function showEndModal() {
  const s = game.summarize();
  const actualHistoryLine = s.hasRealEnd
    ? `<p><strong>Actual history:</strong> CPI inflation ${fmtPct(s.realEndCpi)} (core ${fmtPct(s.realEndCoreCpi)}), unemployment ${fmtPct(s.realEndUnrate)}, 10Y yield ${fmtPct(s.realEndYield10y)}.</p>`
    : `<p><strong>Actual history:</strong> not yet available for ${game.endDateLabel} — FRED data currently runs through ${s.latestRealDateLabel}.</p>`;
  el("end-title").textContent = `Term Complete — ${game.endDateLabel}`;
  el("end-summary").innerHTML = `
    <p class="verdict ${s.verdictClass}">${s.verdict}</p>
    <p><strong>Your outcome:</strong> CPI inflation ${fmtPct(s.playerEndCpi)} (core ${fmtPct(s.playerEndCoreCpi)}), unemployment ${fmtPct(s.playerEndUnrate)}, 10Y yield ${fmtPct(s.playerEndYield10y)}.</p>
    ${actualHistoryLine}
    <p>Average unemployment above the natural rate over your term: ${fmtPct(s.avgExcessUnemployment)} — a rough proxy for the human cost of your policy path.</p>
  `;
  el("end-modal").classList.remove("hidden");
}

function onAdvance() {
  const rate = parseFloat(el("rate-slider").value);
  const snap = game.advanceTurn(rate);
  if (!snap) return;

  chartSet.pushSnapshot(game.turn, snap);
  viz.update(snap);
  refreshStats();
  refreshNews();
  refreshSlider();

  if (game.finished) {
    el("advance-btn").disabled = true;
    showEndModal();
  }
}

function onDelta(delta) {
  const slider = el("rate-slider");
  let v = parseFloat(slider.value) + delta;
  v = Math.min(Math.max(v, parseFloat(slider.min)), parseFloat(slider.max));
  slider.value = v;
  el("rate-slider-readout").textContent = v.toFixed(2);
}

// --- Date-range picker: pick a term length (in quarters), then a start month.
// The start month can be as recent as the latest published data — the term
// then simply runs past that point into turns with no "actual history" to
// compare against yet, since that future hasn't happened. ---

function rangeLabels() {
  const startIdx = parseInt(el("range-start").value, 10);
  const startDate = allDates[startIdx];
  const endDate = addMonths(startDate, termQuarters * 3);
  return { startIdx, startDate, endDate };
}

function refreshRangeLabels() {
  const { startDate, endDate } = rangeLabels();
  el("range-start-label").textContent = formatDateLabel(startDate);
  el("range-end-label").textContent = formatDateLabel(endDate);
}

function setTermQuarters(quarters) {
  termQuarters = quarters;
  document.querySelectorAll(".term-btn").forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.quarters, 10) === quarters);
  });
  refreshRangeLabels();
}

function setupRangePicker() {
  const startInput = el("range-start");
  const maxIdx = allDates.length - 1;
  startInput.min = 0;
  startInput.max = maxIdx;

  const defaultStartIdx = allDates.indexOf(DEFAULT_START);
  startInput.value = defaultStartIdx >= 0 ? defaultStartIdx : 0;

  el("range-min-label").textContent = formatDateLabel(allDates[0]);
  el("range-max-label").textContent = formatDateLabel(allDates[maxIdx]);

  document.querySelectorAll(".term-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTermQuarters(parseInt(btn.dataset.quarters, 10)));
  });

  startInput.addEventListener("input", refreshRangeLabels);

  setTermQuarters(DEFAULT_TERM_QUARTERS);
}

function updateHeaderForRange(startDate, endDate) {
  document.title = `Central Banker: ${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`;
}

async function startNewGame(startDate, termQuartersForGame) {
  if (chartSet) chartSet.destroy();
  if (viz) viz.dispose();
  el("end-modal").classList.add("hidden");
  el("advance-btn").disabled = false;

  game = new Game(historyRecords, startDate, termQuartersForGame);
  updateHeaderForRange(startDate, game.quarterDates[game.totalTurns]);

  const labels = game.quarterDates.map(formatDateLabel);
  const ghost = buildGhostSeries(historyRecords, game.quarterDates);
  chartSet = new ChartSet(labels, ghost);

  const vizContainer = el("viz-canvas-container");
  viz = new EconomyVisualization(vizContainer, el("viz-canvas"));

  const initialSnap = game.state.history[0];
  chartSet.pushSnapshot(0, initialSnap);
  viz.update(initialSnap);
  refreshStats();
  refreshNews();
  refreshSlider();
}

async function init() {
  historyRecords = await loadHistory();
  allDates = getAllDates(historyRecords);

  setupRangePicker();

  const { startDate } = rangeLabels();
  await startNewGame(startDate, termQuarters);

  el("rate-slider").addEventListener("input", (e) => {
    el("rate-slider-readout").textContent = parseFloat(e.target.value).toFixed(2);
  });

  document.querySelectorAll(".rate-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => onDelta(parseFloat(btn.dataset.delta)));
  });

  el("advance-btn").addEventListener("click", onAdvance);

  el("apply-range-btn").addEventListener("click", () => {
    const { startDate } = rangeLabels();
    startNewGame(startDate, termQuarters);
  });

  el("restart-btn").addEventListener("click", () => {
    const { startDate } = rangeLabels();
    startNewGame(startDate, termQuarters);
  });

  el("preset-volcker-btn").addEventListener("click", () => {
    setTermQuarters(20); // full 5-year arc, 1979-01 through 1984-01
    const startIdx = allDates.indexOf("1979-01");
    el("range-start").value = startIdx >= 0 ? startIdx : 0;
    refreshRangeLabels();
    const { startDate } = rangeLabels();
    startNewGame(startDate, termQuarters);
  });
}

init();
