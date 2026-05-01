const viewCopy = {
  overview: {
    eyebrow: "Unified observability",
    title: "Trace & Metrics control room",
    description: "Monitor the Docker observability stack, generate failures, inspect metrics, search logs, and follow alerts from one responsive webapp.",
  },
  metrics: {
    eyebrow: "Prometheus + Grafana",
    title: "Live metrics for checkout-api",
    description: "Track request count, error count, request rate, and p95 latency from Prometheus.",
  },
  logs: {
    eyebrow: "Logstash + Elasticsearch + Kibana",
    title: "Searchable application logs",
    description: "Inspect JSON request logs from the sample service and correlate failures with latency spikes.",
  },
  alerts: {
    eyebrow: "Prometheus + Alertmanager",
    title: "Alert routing and incident state",
    description: "Review the rules that turn bad metrics into actionable alerts.",
  },
  tracing: {
    eyebrow: "Jaeger add-on",
    title: "Distributed tracing path",
    description: "Jaeger is ready for tracing; the next backend upgrade is OpenTelemetry spans from checkout-api.",
  },
  services: {
    eyebrow: "Runtime inventory",
    title: "Observed service map",
    description: "See the demo service and the observability tools that watch it.",
  },
  slo: {
    eyebrow: "Reliability targets",
    title: "SLO and error budget",
    description: "Define what healthy means before alerts become noise.",
  },
  deployments: {
    eyebrow: "Change awareness",
    title: "Deployment and simulation events",
    description: "Use generated failures and slow requests as controlled events for your demo.",
  },
  runbook: {
    eyebrow: "Demo checklist",
    title: "Runbook for the project review",
    description: "Follow this order to prove the complete observability flow.",
  },
  architecture: {
    eyebrow: "Data flow",
    title: "How signals move through the stack",
    description: "Metrics, logs, dashboards, alerts, and tracing each have a clear path.",
  },
};

const viewLinks = document.querySelectorAll("[data-view-link]");
const views = document.querySelectorAll("[data-view]");
const eyebrow = document.querySelector("[data-view-eyebrow]");
const title = document.querySelector("[data-view-title]");
const description = document.querySelector("[data-view-description]");
const openMenu = document.querySelector("[data-open-menu]");
const closeMenu = document.querySelector("[data-close-menu]");
const overlay = document.querySelector("[data-overlay]");
const refreshButtons = document.querySelectorAll("[data-refresh]");
const stackStatus = document.querySelector("[data-stack-status]");
const requestChart = document.querySelector("[data-request-chart]");
const alertFeed = document.querySelector("[data-alert-feed]");
const logStream = document.querySelector("[data-log-stream]");
const latencySparkline = document.querySelector("[data-latency-sparkline]");
const trafficCount = document.querySelector("[data-traffic-count]");
const trafficType = document.querySelector("[data-traffic-type]");
const trafficButton = document.querySelector("[data-generate-traffic]");
const trafficResult = document.querySelector("[data-traffic-result]");
const incidentFeed = document.querySelector("[data-incident-feed]");

const setText = (selector, value) => {
  document.querySelectorAll(selector).forEach((element) => {
    element.textContent = value;
  });
};

function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "waiting";
  return `${value.toFixed(2)} req/s`;
}

function formatLatency(value) {
  if (!Number.isFinite(value)) return "waiting";
  return `${Math.round(value * 1000)} ms`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function renderRequestChart(values) {
  const fallback = [42, 58, 70, 38, 62, 82, 54, 46, 68, 74, 40, 30, 66, 78, 45, 72, 50, 64];
  const source = values?.length ? values : fallback;
  const max = Math.max(...source, 1);
  const bars = source.slice(-18).map((value) => Math.max(8, Math.round((value / max) * 100)));

  requestChart.innerHTML = bars.map((height) => `<span style="height:${height}%"></span>`).join("");
}

function renderSparkline(latency) {
  const high = Number.isFinite(latency) && latency > 0.5;
  latencySparkline.setAttribute(
    "d",
    high
      ? "M12 86 C42 96 58 58 88 74 S132 94 158 48 200 10 230 38 268 82 300 36 338 18 372 62 410 40"
      : "M12 78 C42 98 55 44 86 70 S132 84 150 50 187 20 210 44 250 68 272 30 314 22 336 50 382 80 410 42"
  );
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    alertFeed.innerHTML = "<p>No active alerts found. Generate slow traffic to trigger HighLatencyP95.</p>";
    return;
  }

  alertFeed.innerHTML = alerts
    .map((alert) => {
      const name = alert.labels?.alertname || "Unknown alert";
      const severity = alert.labels?.severity || "unknown";
      const summary = alert.annotations?.summary || "Alert from Alertmanager";
      return `<div class="alert-feed-row"><div><strong>${name}</strong><br><span>${summary}</span></div><strong>${severity}</strong></div>`;
    })
    .join("");
}

function renderLogs(rows) {
  const fallback = [
    { status: 500, path: "/fail", duration_ms: 96, service: "checkout-api" },
    { status: 200, path: "/slow", duration_ms: 742, service: "checkout-api" },
    { status: 200, path: "/health", duration_ms: 18, service: "checkout-api" },
    { status: 200, path: "/metrics", duration_ms: 24, service: "checkout-api" },
  ];
  const visibleRows = rows?.length ? rows : fallback;

  logStream.innerHTML = visibleRows
    .slice(0, 8)
    .map((row) => {
      const status = String(row.status);
      return `<div class="log-row"><span class="${status === "200" ? "ok" : ""}">${escapeHtml(status)}</span><strong>${escapeHtml(row.path || "/")}</strong><em>${escapeHtml(row.service || "checkout-api")}</em><time>${escapeHtml(row.duration_ms || 0)} ms</time></div>`;
    })
    .join("");
}

function renderIncidents(incidents) {
  if (!incidents?.length) {
    incidentFeed.innerHTML = "<p>No synthetic incidents yet. Generate slow or failure traffic.</p>";
    return;
  }

  incidentFeed.innerHTML = incidents
    .slice(0, 8)
    .map((incident) => {
      const time = new Date(incident.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<div class="incident-row"><span>${escapeHtml(incident.status)}</span><strong>${escapeHtml(incident.message)}</strong><time>${time}</time></div>`;
    })
    .join("");
}

function showView(viewName) {
  const nextView = viewCopy[viewName] ? viewName : "overview";

  views.forEach((view) => {
    view.classList.toggle("active-view", view.dataset.view === nextView);
  });

  viewLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.viewLink === nextView);
  });

  eyebrow.textContent = viewCopy[nextView].eyebrow;
  title.textContent = viewCopy[nextView].title;
  description.textContent = viewCopy[nextView].description;
  window.location.hash = nextView;
  closeMobileMenu();
}

function openMobileMenu() {
  document.body.classList.add("menu-open");
  openMenu.setAttribute("aria-expanded", "true");
}

function closeMobileMenu() {
  document.body.classList.remove("menu-open");
  openMenu.setAttribute("aria-expanded", "false");
}

async function prometheusQuery(query) {
  const url = `http://localhost:9090/api/v1/query?query=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  const payload = await response.json();
  return payload.data.result;
}

async function prometheusRange(query) {
  const end = Math.floor(Date.now() / 1000);
  const start = end - 15 * 60;
  const url = `http://localhost:9090/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=45`;
  const response = await fetch(url);
  const payload = await response.json();
  return payload.data.result[0]?.values?.map((item) => Number(item[1])) || [];
}

async function serviceJson(path) {
  const response = await fetch(`http://localhost:3001${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function loadLiveData() {
  try {
    stackStatus.textContent = "Stack online";

    const totals = await prometheusQuery("http_requests_total");
    const rate = await prometheusQuery("sum(rate(http_requests_total[1m])) by (service)");
    const p95 = await prometheusQuery("histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))");
    const range = await prometheusRange("sum(rate(http_requests_total[1m])) by (service)");
    const alertsResponse = await fetch("http://localhost:9093/api/v2/alerts");
    const alerts = await alertsResponse.json();
    const [logSummary, incidents, serviceHealth] = await Promise.all([
      serviceJson("/api/log-summary"),
      serviceJson("/api/incidents"),
      serviceJson("/api/service-health"),
    ]);

    const okCount = totals
      .filter((item) => item.metric.status === "200")
      .reduce((sum, item) => sum + Number(item.value[1]), 0);
    const errorCount = totals
      .filter((item) => item.metric.status === "500")
      .reduce((sum, item) => sum + Number(item.value[1]), 0);
    const totalRequests = okCount + errorCount;
    const requestRate = Number(rate[0]?.value?.[1]);
    const latency = Number(p95[0]?.value?.[1]);

    setText("[data-total-requests]", formatNumber(totalRequests));
    setText("[data-ok-count]", formatNumber(okCount));
    setText("[data-error-count], [data-error-count-copy]", formatNumber(errorCount));
    setText("[data-request-rate]", formatRate(requestRate));
    setText("[data-p95-latency], [data-p95-latency-copy]", formatLatency(latency));
    setText("[data-alert-count]", formatNumber(alerts.length));
    setText("[data-target-health]", "up");
    setText("[data-log-total], [data-log-total-copy]", formatNumber(logSummary.total));
    setText("[data-log-errors]", formatNumber(logSummary.errors));
    setText("[data-log-slow]", formatNumber(logSummary.slow));
    setText("[data-service-status]", serviceHealth.status === "up" ? "Running" : "Check");
    setText("[data-service-signals]", serviceHealth.tracing ? "Metrics + logs + traces" : "Metrics + logs");

    const alertNames = alerts.map((alert) => alert.labels?.alertname);
    setText("[data-latency-alert-state]", alertNames.includes("HighLatencyP95") ? "Active or firing" : "Quiet");
    setText("[data-error-alert-state]", alertNames.includes("HighErrorRate") ? "Active or firing" : "Quiet");
    renderRequestChart(range);
    renderSparkline(latency);
    renderAlerts(alerts);
    renderLogs(logSummary.recent);
    renderIncidents(incidents.incidents);
  } catch (error) {
    stackStatus.textContent = "Open stack tools";
    setText("[data-target-health]", "check tools");
    setText("[data-latency-alert-state]", "Open Prometheus");
    setText("[data-error-alert-state]", "Open Prometheus");
  }
}

async function generateTraffic() {
  const count = Math.min(Math.max(Number(trafficCount.value || 80), 1), 500);
  const type = trafficType.value || "mixed";
  trafficButton.disabled = true;
  trafficResult.textContent = `Generating ${count} ${type} requests...`;

  try {
    const result = await serviceJson(`/simulate?count=${count}&type=${encodeURIComponent(type)}`);
    trafficResult.textContent = `${result.message}: ${result.ok} OK, ${result.errors} failures. Prometheus will reflect it after the next scrape.`;
    setTimeout(loadLiveData, 1600);
  } catch (error) {
    trafficResult.textContent = "Could not reach checkout-api. Make sure Docker Compose is running.";
  } finally {
    trafficButton.disabled = false;
  }
}

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showView(link.dataset.viewLink);
  });
});

openMenu.addEventListener("click", openMobileMenu);
closeMenu.addEventListener("click", closeMobileMenu);
overlay.addEventListener("click", closeMobileMenu);
refreshButtons.forEach((button) => button.addEventListener("click", loadLiveData));
trafficButton.addEventListener("click", generateTraffic);
window.addEventListener("resize", () => {
  if (window.innerWidth > 820) closeMobileMenu();
});

renderRequestChart();
renderIncidents([]);
showView(window.location.hash.replace("#", "") || "overview");
loadLiveData();
setInterval(loadLiveData, 15000);
