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
  const real = game.realHistoryAtCurrentTurn;

  el("stat-cpi").textContent = fmtPct(snap.cpiYoy);
  el("stat-cpi-core").textContent = fmtPct(real.cpi_core_yoy);
  el("stat-fedfunds").textContent = fmtPct(snap.fedfunds);
  el("stat-yield10y").textContent = fmtPct(snap.yield10y);
  el("stat-unrate").textContent = fmtPct(snap.unrate);

  el("stat-cpi-ghost").textContent = `history: ${fmtPct(real.cpi_yoy)}`;
  el("stat-cpi-core-ghost").textContent = `history: ${fmtPct(real.cpi_core_yoy)}`;
  el("stat-fedfunds-ghost").textContent = `history: ${fmtPct(real.fedfunds)}`;
  el("stat-yield10y-ghost").textContent = `history: ${fmtPct(real.yield10y)}`;
  el("stat-unrate-ghost").textContent = `history: ${fmtPct(real.unrate)}`;

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
  el("end-title").textContent = `Term Complete — ${game.endDateLabel}`;
  el("end-summary").innerHTML = `
    <p class="verdict ${s.verdictClass}">${s.verdict}</p>
    <p><strong>Your outcome:</strong> CPI inflation ${fmtPct(s.playerEndCpi)}, unemployment ${fmtPct(s.playerEndUnrate)}, 10Y yield ${fmtPct(s.playerEndYield10y)}.</p>
    <p><strong>Actual history:</strong> CPI inflation ${fmtPct(s.realEndCpi)}, unemployment ${fmtPct(s.realEndUnrate)}, 10Y yield ${fmtPct(s.realEndYield10y)}.</p>
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

// --- Date-range picker: pick a term length (in quarters), then a start month ---

function rangeLabels() {
  const startIdx = parseInt(el("range-start").value, 10);
  const termMonths = termQuarters * 3;
  const endIdx = Math.min(startIdx + termMonths, allDates.length - 1);
  return {
    startIdx,
    endIdx,
    startDate: allDates[startIdx],
    endDate: allDates[endIdx],
  };
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

  const startInput = el("range-start");
  const termMonths = termQuarters * 3;
  const maxStartIdx = Math.max(allDates.length - 1 - termMonths, 0);
  startInput.max = maxStartIdx;
  if (parseInt(startInput.value, 10) > maxStartIdx) startInput.value = maxStartIdx;
  el("range-max-label").textContent = formatDateLabel(allDates[maxStartIdx]);

  refreshRangeLabels();
}

function setupRangePicker() {
  const startInput = el("range-start");
  startInput.min = 0;
  startInput.max = allDates.length - 1; // provisional, so the value below isn't clamped to 0

  const defaultStartIdx = allDates.indexOf(DEFAULT_START);
  startInput.value = defaultStartIdx >= 0 ? defaultStartIdx : 0;

  el("range-min-label").textContent = formatDateLabel(allDates[0]);

  document.querySelectorAll(".term-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTermQuarters(parseInt(btn.dataset.quarters, 10)));
  });

  startInput.addEventListener("input", refreshRangeLabels);

  setTermQuarters(DEFAULT_TERM_QUARTERS);
}

function updateHeaderForRange(startDate, endDate) {
  document.title = `Central Banker: ${formatDateLabel(startDate)} – ${formatDateLabel(endDate)}`;
  el("scenario-subtitle").textContent = `${formatDateLabel(startDate)} – ${formatDateLabel(endDate)} · Set the fed funds rate and watch inflation, unemployment, and the 10Y yield respond`;
}

async function startNewGame(startDate, endDate) {
  if (chartSet) chartSet.destroy();
  if (viz) viz.dispose();
  el("end-modal").classList.add("hidden");
  el("advance-btn").disabled = false;

  game = new Game(historyRecords, allDates, startDate, endDate);
  updateHeaderForRange(startDate, endDate);

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

  const { startDate, endDate } = rangeLabels();
  await startNewGame(startDate, endDate);

  el("rate-slider").addEventListener("input", (e) => {
    el("rate-slider-readout").textContent = parseFloat(e.target.value).toFixed(2);
  });

  document.querySelectorAll(".rate-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => onDelta(parseFloat(btn.dataset.delta)));
  });

  el("advance-btn").addEventListener("click", onAdvance);

  el("apply-range-btn").addEventListener("click", () => {
    const { startDate, endDate } = rangeLabels();
    startNewGame(startDate, endDate);
  });

  el("restart-btn").addEventListener("click", () => {
    const { startDate, endDate } = rangeLabels();
    startNewGame(startDate, endDate);
  });
}

init();
