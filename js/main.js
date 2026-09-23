let game, chartSet, viz, historyRecords;

const el = (id) => document.getElementById(id);

async function loadHistory() {
  const res = await fetch("data/volcker_history.json");
  return res.json();
}

function fmtPct(v) {
  return `${v.toFixed(2)}%`;
}

function refreshStats() {
  const snap = game.state.history[game.state.history.length - 1];
  const real = game.realHistoryAtCurrentTurn;

  el("stat-cpi").textContent = fmtPct(snap.cpiYoy);
  el("stat-fedfunds").textContent = fmtPct(snap.fedfunds);
  el("stat-gs10").textContent = fmtPct(snap.gs10);
  el("stat-unrate").textContent = fmtPct(snap.unrate);

  el("stat-cpi-ghost").textContent = `history: ${fmtPct(real.cpi_yoy)}`;
  el("stat-fedfunds-ghost").textContent = `history: ${fmtPct(real.fedfunds)}`;
  el("stat-gs10-ghost").textContent = `history: ${fmtPct(real.gs10)}`;
  el("stat-unrate-ghost").textContent = `history: ${fmtPct(real.unrate)}`;

  el("turn-counter").textContent = `${game.turn} / ${TOTAL_TURNS}`;
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
  el("end-title").textContent = "Term Complete — January 1984";
  el("end-summary").innerHTML = `
    <p class="verdict ${s.verdictClass}">${s.verdict}</p>
    <p><strong>Your outcome:</strong> CPI inflation ${fmtPct(s.playerEndCpi)}, unemployment ${fmtPct(s.playerEndUnrate)}, 10Y yield ${fmtPct(s.playerEndGs10)}.</p>
    <p><strong>Actual history:</strong> CPI inflation ${fmtPct(s.realEndCpi)}, unemployment ${fmtPct(s.realEndUnrate)}, 10Y yield ${fmtPct(s.realEndGs10)}.</p>
    <p>Average unemployment above the natural rate over your term: ${fmtPct(s.avgExcessUnemployment)} — a rough proxy for the human cost of your disinflation.</p>
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

async function init() {
  historyRecords = await loadHistory();
  game = new Game(historyRecords);

  const quarterLabels = game.quarterDates.map(formatDateLabel);
  const ghost = buildGhostSeries(historyRecords, game.quarterDates);
  chartSet = new ChartSet(quarterLabels, ghost);

  const vizContainer = el("viz-canvas-container");
  viz = new EconomyVisualization(vizContainer, el("viz-canvas"));

  const initialSnap = game.state.history[0];
  chartSet.pushSnapshot(0, initialSnap);
  viz.update(initialSnap);
  refreshStats();
  refreshNews();
  refreshSlider();

  el("rate-slider").addEventListener("input", (e) => {
    el("rate-slider-readout").textContent = parseFloat(e.target.value).toFixed(2);
  });

  document.querySelectorAll(".rate-buttons button").forEach((btn) => {
    btn.addEventListener("click", () => onDelta(parseFloat(btn.dataset.delta)));
  });

  el("advance-btn").addEventListener("click", onAdvance);

  el("restart-btn").addEventListener("click", () => {
    el("end-modal").classList.add("hidden");
    el("advance-btn").disabled = false;
    chartSet.destroy();
    viz.dispose();
    init();
  });
}

init();
