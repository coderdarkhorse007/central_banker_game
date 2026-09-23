const CHART_COLORS = {
  player: "#4fd1c5",
  player2: "#f6ad55",
  ghost: "#5a6b7a",
  ghost2: "#63b3ed",
  grid: "#1c2733",
  text: "#8ea0b3",
};

function baseChartOptions(yLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: {
        ticks: { color: CHART_COLORS.text, maxRotation: 0, autoSkip: true, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid },
      },
      y: {
        ticks: { color: CHART_COLORS.text, font: { size: 10 } },
        grid: { color: CHART_COLORS.grid },
        title: { display: true, text: yLabel, color: CHART_COLORS.text, font: { size: 11 } },
      },
    },
    plugins: {
      legend: { labels: { color: CHART_COLORS.text, font: { size: 10 }, boxWidth: 12 } },
      tooltip: { mode: "index", intersect: false },
    },
  };
}

function makeLineDataset(label, color, dashed) {
  return {
    label,
    data: [],
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    borderDash: dashed ? [5, 4] : [],
    tension: 0.15,
  };
}

class ChartSet {
  constructor(labels, ghostSeries) {
    this.labels = labels;

    this.cpiChart = new Chart(document.getElementById("chart-cpi"), {
      type: "line",
      data: {
        labels,
        datasets: [
          makeLineDataset("Your path (headline)", CHART_COLORS.player, false),
          makeLineDataset("Your path (core)", CHART_COLORS.player2, false),
          makeLineDataset("Actual history (headline, CPIAUCSL)", CHART_COLORS.ghost, true),
          makeLineDataset("Actual history (core, CPILFESL)", CHART_COLORS.ghost2, true),
        ],
      },
      options: baseChartOptions("CPI YoY %"),
    });
    this.cpiChart.data.datasets[2].data = ghostSeries.cpiYoy;
    this.cpiChart.data.datasets[3].data = ghostSeries.cpiCoreYoy;

    this.ratesChart = new Chart(document.getElementById("chart-rates"), {
      type: "line",
      data: {
        labels,
        datasets: [
          makeLineDataset("Fed funds", CHART_COLORS.player, false),
          makeLineDataset("10Y yield (DGS10)", CHART_COLORS.player2, false),
          makeLineDataset("Fed funds (history)", CHART_COLORS.ghost, true),
          makeLineDataset("10Y yield (history)", CHART_COLORS.ghost2, true),
        ],
      },
      options: baseChartOptions("Rate %"),
    });
    this.ratesChart.data.datasets[2].data = ghostSeries.fedfunds;
    this.ratesChart.data.datasets[3].data = ghostSeries.yield10y;

    this.unrateChart = new Chart(document.getElementById("chart-unrate"), {
      type: "line",
      data: {
        labels,
        datasets: [
          makeLineDataset("Your path", CHART_COLORS.player, false),
          makeLineDataset("Actual history", CHART_COLORS.ghost, true),
        ],
      },
      options: baseChartOptions("Unemployment %"),
    });
    this.unrateChart.data.datasets[1].data = ghostSeries.unrate;

    // The Pressure Index is entirely fictional — there's no real FRED
    // counterpart, so this chart is a single "Your path" line with no
    // ghost/history dataset.
    this.pressureIndexChart = new Chart(document.getElementById("chart-pressureindex"), {
      type: "line",
      data: {
        labels,
        datasets: [makeLineDataset("The Pressure Index", CHART_COLORS.player2, false)],
      },
      options: baseChartOptions("Index (start = 100)"),
    });

    this.cpiChart.update();
    this.ratesChart.update();
    this.unrateChart.update();
    this.pressureIndexChart.update();
  }

  pushSnapshot(turnIndex, snap) {
    this.cpiChart.data.datasets[0].data[turnIndex] = snap.cpiYoy;
    this.cpiChart.data.datasets[1].data[turnIndex] = snap.coreCpiYoy;
    this.ratesChart.data.datasets[0].data[turnIndex] = snap.fedfunds;
    this.ratesChart.data.datasets[1].data[turnIndex] = snap.yield10y;
    this.unrateChart.data.datasets[0].data[turnIndex] = snap.unrate;
    this.pressureIndexChart.data.datasets[0].data[turnIndex] = snap.pressureIndex;
    this.cpiChart.update();
    this.ratesChart.update();
    this.unrateChart.update();
    this.pressureIndexChart.update();
  }

  destroy() {
    this.cpiChart.destroy();
    this.ratesChart.destroy();
    this.unrateChart.destroy();
    this.pressureIndexChart.destroy();
  }
}

function buildGhostSeries(historyRecords, quarterDates) {
  const byMonth = {};
  historyRecords.forEach((r) => (byMonth[r.date] = r));
  const series = { cpiYoy: [], cpiCoreYoy: [], fedfunds: [], yield10y: [], unrate: [] };
  quarterDates.forEach((d) => {
    const r = byMonth[d];
    series.cpiYoy.push(r ? r.cpi_yoy : null);
    series.cpiCoreYoy.push(r ? r.cpi_core_yoy : null);
    series.fedfunds.push(r ? r.fedfunds : null);
    series.yield10y.push(r ? r.yield10y : null);
    series.unrate.push(r ? r.unrate : null);
  });
  return series;
}
