const viewCopy = {
  overview: {
    eyebrow: "Unified observability",
    title: "Trace & Metrics control room",
    description: "Monitor service health, endpoint metrics, logs, traces, SLOs, deployments, and incident response from one local dashboard.",
  },
  metrics: {
    eyebrow: "Prometheus + endpoint analytics",
    title: "Endpoint-level request metrics",
    description: "Compare request volume, error rate, average latency, slow calls, and business counters by endpoint.",
  },
  logs: {
    eyebrow: "Logstash + Elasticsearch + Kibana",
    title: "Searchable application logs",
    description: "Inspect severity, status, duration, service, path, and recent failure context from generated backend logs.",
  },
  alerts: {
    eyebrow: "Prometheus + Alertmanager",
    title: "Alert routing and incident state",
    description: "Review active alerts, synthetic incident history, severity, affected service, and runbook hints.",
  },
  tracing: {
    eyebrow: "OpenTelemetry + Jaeger",
    title: "Trace operations and dependencies",
    description: "Follow slow operations across checkout, payment, inventory, and auth demo services.",
  },
  services: {
    eyebrow: "Runtime inventory",
    title: "Observed service map",
    description: "Track service ownership, status, versions, dependencies, and available telemetry signals.",
  },
  slo: {
    eyebrow: "Reliability targets",
    title: "SLO and error budget",
    description: "See availability, latency compliance, error budget, burn rate, and request totals.",
  },
  deployments: {
    eyebrow: "Change awareness",
    title: "Deployment health timeline",
    description: "Compare recent release events against error and latency symptoms.",
  },
  runbook: {
    eyebrow: "Demo checklist",
    title: "Runbook for diagnosis",
    description: "Follow a practical investigation path from symptom to metric, log, trace, alert, and rollback decision.",
  },
  architecture: {
    eyebrow: "Data flow",
    title: "How signals move through the stack",
    description: "Metrics, logs, dashboards, alerts, and traces each have a clear path through the system.",
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const viewLinks = $$("[data-view-link]");
const views = $$("[data-view]");
const eyebrow = $("[data-view-eyebrow]");
const title = $("[data-view-title]");
const description = $("[data-view-description]");
const openMenu = $("[data-open-menu]");
const closeMenu = $("[data-close-menu]");
const overlay = $("[data-overlay]");
const refreshButtons = $$("[data-refresh]");
const stackStatus = $("[data-stack-status]");
const requestChart = $("[data-request-chart]");
const alertFeed = $("[data-alert-feed]");
const logStream = $("[data-log-stream]");
const latencySparkline = $("[data-latency-sparkline]");
const latencyChartLabel = $("[data-latency-chart-label]");
const trafficCount = $("[data-traffic-count]");
const trafficType = $("[data-traffic-type]");
const trafficSelect = $("[data-traffic-select]");
const trafficSelectButton = $("[data-traffic-select-button]");
const trafficSelectLabel = $("[data-traffic-select-label]");
const trafficOptions = $$("[data-traffic-option]");
const trafficButton = $("[data-generate-traffic]");
const trafficResult = $("[data-traffic-result]");
const incidentFeed = $("[data-incident-feed]");
const traceStatus = $("[data-trace-status]");
const fallbackKey = "traceMetricsDemoCounters";
const emptyFallbackState = {
  business: {
    logins: 0,
    checkouts: 0,
    payments: 0,
    paymentFailures: 0,
    abandonedCarts: 0,
  },
  slo: {
    total_requests: 0,
    ok: 0,
    errors: 0,
    slow: 0,
  },
};

const setText = (selector, value) => {
  $$(selector).forEach((element) => {
    element.textContent = value;
  });
};

function formatNumber(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${value.toFixed(value >= 99 ? 2 : 1)}%`;
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "waiting";
  return `${value.toFixed(2)} req/s`;
}

function formatLatency(value) {
  if (!Number.isFinite(value)) return "waiting";
  return `${Math.round(value * 1000)} ms`;
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)} ms`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function timeLabel(value) {
  if (!value) return "never";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function readFallbackState() {
  try {
    const saved = JSON.parse(localStorage.getItem(fallbackKey) || "{}");
    return {
      business: { ...emptyFallbackState.business, ...(saved.business || {}) },
      slo: { ...emptyFallbackState.slo, ...(saved.slo || {}) },
    };
  } catch (error) {
    return JSON.parse(JSON.stringify(emptyFallbackState));
  }
}

function writeFallbackState(state) {
  localStorage.setItem(fallbackKey, JSON.stringify(state));
}

function fallbackSloSummary(state) {
  const total = state.slo.total_requests;
  const errors = state.slo.errors;
  const slow = state.slo.slow;
  const availability = total ? ((total - errors) / total) * 100 : 100;
  const latencyCompliance = total ? ((total - slow) / total) * 100 : 100;
  return {
    availability,
    latency_compliance: latencyCompliance,
    error_budget_remaining: Math.max(0, 100 - Math.max(0, 99.9 - availability) * 100),
    burn_rate: total ? (errors + slow) / total : 0,
    error_rate: total ? (errors / total) * 100 : 0,
    total_requests: total,
  };
}

function rememberGeneratedTraffic(type, result) {
  const state = readFallbackState();
  const requested = Number(result.requested || 0);
  const ok = Number(result.ok || 0);
  const errors = Number(result.errors || 0);
  const slow = Number(result.slow || 0);

  state.slo.total_requests += requested;
  state.slo.ok += ok;
  state.slo.errors += errors;
  state.slo.slow += slow;

  if (type === "login" || type === "mixed" || type === "healthy") {
    state.business.logins += Math.max(1, Math.round(ok * 0.45));
  }
  if (type === "checkout" || type === "mixed" || type === "recovery") {
    state.business.checkouts += Math.max(1, Math.round(ok * 0.35));
    state.business.abandonedCarts += Math.max(0, Math.round(requested * 0.08));
  }
  if (type === "payment" || type === "mixed" || type === "recovery") {
    state.business.payments += Math.max(0, Math.round(ok * 0.3));
  }
  if (type === "payment" || type === "fail" || type === "outage") {
    state.business.paymentFailures += Math.max(1, errors || Math.round(requested * 0.25));
  }

  writeFallbackState(state);
  return state;
}

function renderRequestChart(values) {
  if (!requestChart) return;
  const fallback = [42, 58, 70, 38, 62, 82, 54, 46, 68, 74, 40, 30, 66, 78, 45, 72, 50, 64];
  const source = values?.length ? values : fallback;
  const max = Math.max(...source, 1);
  const bars = source.slice(-18).map((value) => Math.max(8, Math.round((value / max) * 100)));

  requestChart.innerHTML = bars.map((height, index) => `<span style="height:${height}%" title="Sample ${index + 1}: ${height}%"></span>`).join("");
}

function renderSparkline(latency) {
  if (!latencySparkline) return;
  const high = Number.isFinite(latency) && latency > 0.5;
  latencySparkline.setAttribute(
    "d",
    high
      ? "M12 86 C42 96 58 58 88 74 S132 94 158 48 200 10 230 38 268 82 300 36 338 18 372 62 410 40"
      : "M12 78 C42 98 55 44 86 70 S132 84 150 50 187 20 210 44 250 68 272 30 314 22 336 50 382 80 410 42"
  );
}

function renderAlerts(alerts) {
  if (!alertFeed) return;
  if (!alerts.length) {
    alertFeed.innerHTML = "<p>No active alerts found. Generate slow, payment, or outage traffic to trigger alert rules.</p>";
    return;
  }

  alertFeed.innerHTML = alerts
    .map((alert) => {
      const name = alert.labels?.alertname || "Unknown alert";
      const severity = alert.labels?.severity || "unknown";
      const service = alert.labels?.service || "sample service";
      const summary = alert.annotations?.summary || "Alert from Alertmanager";
      return `<div class="alert-feed-row"><div><strong>${escapeHtml(name)}</strong><br><span>${escapeHtml(service)} - ${escapeHtml(summary)}</span></div><strong>${escapeHtml(severity)}</strong></div>`;
    })
    .join("");
}

function renderLogs(rows) {
  if (!logStream) return;
  const fallback = [
    { severity: "error", status: 500, path: "/api/payment/charge", duration_ms: 824, service: "payment-service" },
    { severity: "warn", status: 200, path: "/api/checkout", duration_ms: 742, service: "checkout-api" },
    { severity: "info", status: 200, path: "/api/login", duration_ms: 88, service: "auth-service" },
  ];
  const visibleRows = rows?.length ? rows : fallback;

  logStream.innerHTML = visibleRows
    .slice(0, 10)
    .map((row) => {
      const status = Number(row.status);
      const severity = row.severity || (status >= 500 ? "error" : row.duration_ms >= 500 ? "warn" : "info");
      return `<div class="log-row ${escapeHtml(severity)}"><span class="${status < 400 ? "ok" : ""}">${escapeHtml(status)}</span><strong>${escapeHtml(row.path || "/")}</strong><em>${escapeHtml(row.service || "checkout-api")}</em><time>${escapeHtml(row.duration_ms || 0)} ms</time></div>`;
    })
    .join("");
}

function renderIncidents(incidents) {
  if (!incidentFeed) return;
  if (!incidents?.length) {
    incidentFeed.innerHTML = "<p>No synthetic incidents yet. Generate slow, failure, payment, or outage traffic.</p>";
    return;
  }

  incidentFeed.innerHTML = incidents
    .slice(0, 10)
    .map((incident) => (
      `<div class="incident-row ${escapeHtml(incident.severity || "warning")}"><span>${escapeHtml(incident.status)}</span><strong>${escapeHtml(incident.service)}: ${escapeHtml(incident.message)}</strong><time>${timeLabel(incident.timestamp)}</time><small>${escapeHtml(incident.runbook || "")}</small></div>`
    ))
    .join("");
}

function renderEndpointTable(endpoints) {
  const container = $("[data-endpoint-table]");
  if (!container) return;
  const rows = endpoints?.length ? endpoints : [];
  if (!rows.length) {
    container.innerHTML = `<div class="service-row"><span>No endpoint data yet</span><span>Generate traffic</span><span>--</span><span>--</span><span>--</span></div>`;
    return;
  }

  container.innerHTML = `
    <div class="service-row endpoint-head"><span>Endpoint</span><span>Service</span><span>Traffic</span><span>Errors</span><span>Avg latency</span></div>
    ${rows.slice(0, 10).map((row) => `
      <div class="service-row endpoint-row">
        <span><strong>${escapeHtml(row.method)} ${escapeHtml(row.path)}</strong><small>${escapeHtml(row.status)}</small></span>
        <span>${escapeHtml(row.service)}</span>
        <span>${formatNumber(row.total)}</span>
        <span>${formatPercent(row.error_rate * 100)}</span>
        <span>${formatMs(row.avg_ms)}</span>
      </div>
    `).join("")}`;
}

function renderBusinessMetrics(business) {
  const container = $("[data-business-metrics]");
  if (!container) return;
  const items = [
    ["Logins", business?.logins],
    ["Checkouts", business?.checkouts],
    ["Payments", business?.payments],
    ["Payment failures", business?.paymentFailures],
    ["Abandoned carts", business?.abandonedCarts],
  ];
  container.innerHTML = items
    .map(([label, value]) => `<div><strong>${formatNumber(Number(value || 0))}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function renderServices(services) {
  const container = $("[data-service-table]");
  if (!container) return;
  container.innerHTML = `
    <div class="service-row service-head"><span>Service</span><span>Status</span><span>Version</span><span>Dependencies</span><span>Signals</span></div>
    ${(services || []).map((item) => `
      <div class="service-row service-wide-row">
        <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.owner)} owner</small></span>
        <span><strong class="${item.health === "good" ? "good" : "warn"}">${escapeHtml(item.health || item.status)}</strong></span>
        <span>${escapeHtml(item.version)}</span>
        <span>${escapeHtml((item.dependencies || []).join(", ") || "none")}</span>
        <span>${escapeHtml(item.signals)}</span>
      </div>
    `).join("")}`;
}

function renderSlo(slo) {
  if (!slo) {
    setText("[data-slo-availability]", "--");
    setText("[data-slo-latency]", "--");
    setText("[data-slo-error-budget]", "--");
    setText("[data-slo-burn]", "--");
    setText("[data-slo-total]", "--");
    setText("[data-slo-error-rate]", "--");
    return;
  }

  setText("[data-slo-availability]", formatPercent(Number(slo?.availability)));
  setText("[data-slo-latency]", formatPercent(Number(slo?.latency_compliance)));
  setText("[data-slo-error-budget]", formatPercent(Number(slo?.error_budget_remaining)));
  setText("[data-slo-burn]", Number.isFinite(Number(slo?.burn_rate)) ? `${Number(slo.burn_rate).toFixed(2)}x` : "--");
  setText("[data-slo-total]", formatNumber(Number(slo?.total_requests)));
  setText("[data-slo-error-rate]", formatPercent(Number(slo?.error_rate)));
}

function renderDeployments(deployments) {
  const container = $("[data-deployment-table]");
  if (!container) return;
  container.innerHTML = `
    <div class="service-row deployment-head"><span>Version</span><span>Service</span><span>Status</span><span>Impact</span><span>Time</span></div>
    ${(deployments || []).map((item) => `
      <div class="service-row deployment-row">
        <span><strong>${escapeHtml(item.version)}</strong></span>
        <span>${escapeHtml(item.service)}</span>
        <span><strong class="${item.status === "healthy" ? "good" : item.status === "rolled-back" ? "bad" : "warn"}">${escapeHtml(item.status)}</strong></span>
        <span>${escapeHtml(item.impact)}</span>
        <span>${timeLabel(item.timestamp)}</span>
      </div>
    `).join("")}`;
}

function renderTraceSummary(traces) {
  const container = $("[data-trace-summary]");
  if (!container) return;
  if (!traces?.length) {
    container.innerHTML = "<p>Generate traffic to populate operation-level trace summaries.</p>";
    return;
  }
  container.innerHTML = traces
    .map((item) => `
      <div class="trace-row">
        <span>${escapeHtml(item.service)}</span>
        <strong>${escapeHtml(item.operation)}</strong>
        <em>${formatMs(item.avg_ms)} avg</em>
        <small>${escapeHtml(item.dependency)} dependency</small>
      </div>
    `)
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

function closeTrafficSelect() {
  trafficSelect.classList.remove("open");
  trafficSelectButton.setAttribute("aria-expanded", "false");
}

function setTrafficType(value, label) {
  trafficType.value = value;
  trafficSelectLabel.textContent = label;
  trafficOptions.forEach((option) => {
    option.setAttribute("aria-selected", String(option.value === value));
  });
  closeTrafficSelect();
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

async function optionalValue(loader, fallback) {
  try {
    return await loader();
  } catch (error) {
    return fallback;
  }
}

async function loadLiveData() {
  const [totals, rate, p95, range, alerts, logSummary, incidents, serviceHealth, endpointData, services, slo, deployments, traceSummary, system] = await Promise.all([
    optionalValue(() => prometheusQuery("http_requests_total"), []),
    optionalValue(() => prometheusQuery("sum(rate(http_requests_total[1m])) by (service)"), []),
    optionalValue(() => prometheusQuery("histogram_quantile(0.95, sum by (le, service) (rate(http_request_duration_seconds_bucket[5m])))"), []),
    optionalValue(() => prometheusRange("sum(rate(http_requests_total[1m])) by (service)"), []),
    optionalValue(() => fetch("http://localhost:9093/api/v2/alerts").then((response) => response.json()), []),
    optionalValue(() => serviceJson("/api/log-summary"), { total: 0, errors: 0, warnings: 0, slow: 0, recent: [] }),
    optionalValue(() => serviceJson("/api/incidents"), { incidents: [] }),
    optionalValue(() => serviceJson("/api/service-health"), { status: "down", service: "checkout-api", version: "local", tracing: false }),
    optionalValue(() => serviceJson("/api/endpoint-metrics"), { endpoints: [], business: {} }),
    optionalValue(() => serviceJson("/api/services"), { services: [] }),
    optionalValue(() => serviceJson("/api/slo"), null),
    optionalValue(() => serviceJson("/api/deployments"), { deployments: [] }),
    optionalValue(() => serviceJson("/api/trace-summary"), { traces: [] }),
    optionalValue(() => serviceJson("/api/system"), { rss_mb: NaN }),
  ]);

  const serviceOnline = serviceHealth.status === "up";
  stackStatus.textContent = serviceOnline ? "Stack online" : "Open stack tools";

  const okCount = totals
    .filter((item) => item.metric.status === "200")
    .reduce((sum, item) => sum + Number(item.value[1]), 0);
  const clientErrorCount = totals
    .filter((item) => item.metric.status === "400")
    .reduce((sum, item) => sum + Number(item.value[1]), 0);
  const errorCount = totals
    .filter((item) => item.metric.status === "500")
    .reduce((sum, item) => sum + Number(item.value[1]), 0);
  const serviceCounters = serviceHealth.counters || {};
  const totalRequests = okCount + clientErrorCount + errorCount || serviceCounters.total || 0;
  const requestRate = Number(rate[0]?.value?.[1]);
  const latency = Number(p95[0]?.value?.[1]);

  setText("[data-total-requests]", formatNumber(totalRequests));
  setText("[data-ok-count]", formatNumber(okCount || serviceCounters.ok || 0));
  setText("[data-client-error-count]", formatNumber(clientErrorCount));
  setText("[data-error-count], [data-error-count-copy]", formatNumber(errorCount || serviceCounters.errors || 0));
  setText("[data-request-rate]", formatRate(requestRate));
  setText("[data-p95-latency], [data-p95-latency-copy]", formatLatency(latency));
  setText("[data-service-version]", serviceHealth.version || "local");
  setText("[data-runtime-memory]", Number.isFinite(Number(system.rss_mb)) ? `${formatNumber(Number(system.rss_mb))} MB` : "--");
  if (latencyChartLabel) latencyChartLabel.textContent = `current ${formatLatency(latency)}`;
  setText("[data-alert-count]", formatNumber(alerts.length));
  setText("[data-target-health]", serviceOnline ? "up" : "check tools");
  setText("[data-log-total], [data-log-total-copy]", formatNumber(Number(logSummary.total || 0)));
  setText("[data-log-errors]", formatNumber(Number(logSummary.errors || 0)));
  setText("[data-log-warnings]", formatNumber(Number(logSummary.warnings || 0)));
  setText("[data-log-slow]", formatNumber(Number(logSummary.slow || 0)));
  setText("[data-service-status]", serviceOnline ? "Running" : "Check");
  setText("[data-service-signals]", serviceHealth.tracing ? "Metrics + logs + traces + SLO" : "Metrics + logs + SLO");
  traceStatus.textContent = serviceHealth.tracing
    ? "Generated requests create OpenTelemetry spans and export them to Jaeger through OTLP HTTP."
    : "Metrics and logs are live when checkout-api is running; Jaeger tracing appears after the Docker stack starts.";

  const alertNames = alerts.map((alert) => alert.labels?.alertname);
  setText("[data-latency-alert-state]", alertNames.includes("HighLatencyP95") ? "Active or firing" : "Quiet");
  setText("[data-error-alert-state]", alertNames.includes("HighErrorRate") ? "Active or firing" : "Quiet");
  renderRequestChart(range);
  renderSparkline(latency);
  renderAlerts(alerts);
  renderLogs(logSummary.recent);
  renderIncidents(incidents.incidents);
  const fallbackState = readFallbackState();
  const hasBusinessApi = Object.values(endpointData.business || {}).some((value) => Number(value) > 0);
  const hasSloApi = slo && Number(slo.total_requests) > 0;

  renderEndpointTable(endpointData.endpoints);
  renderBusinessMetrics(hasBusinessApi ? endpointData.business : fallbackState.business);
  renderServices(services.services);
  renderSlo(hasSloApi ? slo : fallbackSloSummary(fallbackState));
  renderDeployments(deployments.deployments);
  renderTraceSummary(traceSummary.traces);
}

async function generateTraffic() {
  const count = Math.min(Math.max(Number(trafficCount.value || 80), 1), 500);
  const type = trafficType.value || "mixed";
  trafficButton.disabled = true;
  trafficResult.textContent = `Generating ${count} ${type} requests...`;

  try {
    const result = await serviceJson(`/simulate?count=${count}&type=${encodeURIComponent(type)}`);
    rememberGeneratedTraffic(type, result);
    trafficResult.textContent = `${result.message}: ${result.ok} OK, ${result.errors} failures, ${Number(result.slow || 0)} slow. Prometheus will reflect it after the next scrape.`;
    loadLiveData();
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
trafficSelectButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const open = trafficSelect.classList.toggle("open");
  trafficSelectButton.setAttribute("aria-expanded", String(open));
});
trafficOptions.forEach((option) => {
  option.addEventListener("click", (event) => {
    event.stopPropagation();
    setTrafficType(option.value, option.textContent.trim());
  });
});
document.addEventListener("click", (event) => {
  if (!trafficSelect.contains(event.target)) closeTrafficSelect();
});
trafficButton.addEventListener("click", generateTraffic);
window.addEventListener("resize", () => {
  if (window.innerWidth > 820) closeMobileMenu();
});

renderRequestChart();
renderIncidents([]);
showView(window.location.hash.replace("#", "") || "overview");
loadLiveData();
setInterval(loadLiveData, 15000);
