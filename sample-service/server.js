const http = require("http");
const net = require("net");
const { trace, SpanStatusCode } = require("@opentelemetry/api");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-http");
const { Resource } = require("@opentelemetry/resources");
const { SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
const { SemanticResourceAttributes } = require("@opentelemetry/semantic-conventions");

const port = Number(process.env.PORT || 3001);
const service = process.env.SERVICE_NAME || "checkout-api";
const logstashHost = process.env.LOGSTASH_HOST;
const logstashPort = Number(process.env.LOGSTASH_PORT || 5000);
const elasticsearchUrl = process.env.ELASTICSEARCH_URL || "http://elasticsearch:9200";
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://jaeger:4318";
const demoVersion = process.env.DEMO_VERSION || "2026.06.1";

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: service,
  }),
});
provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })));
provider.register();
const tracer = trace.getTracer(service);

const buckets = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const endpointMetrics = new Map();
const incidentHistory = [];
const deploymentEvents = [
  {
    id: "deploy-3",
    version: demoVersion,
    service: "checkout-api",
    status: "healthy",
    impact: "baseline traffic stable",
    timestamp: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
  },
  {
    id: "deploy-2",
    version: "2026.05.4",
    service: "payment-service",
    status: "watch",
    impact: "payment failures increased during canary",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: "deploy-1",
    version: "2026.05.2",
    service: "auth-service",
    status: "rolled-back",
    impact: "login p95 crossed SLO for 9 minutes",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];
const businessCounters = {
  logins: 0,
  checkouts: 0,
  payments: 0,
  paymentFailures: 0,
  abandonedCarts: 0,
};

const serviceCatalog = [
  {
    name: "checkout-api",
    kind: "node",
    owner: "growth",
    version: demoVersion,
    status: "running",
    dependencies: ["payment-service", "inventory-service"],
    signals: "metrics, logs, traces, slo",
  },
  {
    name: "auth-service",
    kind: "simulated",
    owner: "identity",
    version: "2026.05.2",
    status: "running",
    dependencies: ["user-db"],
    signals: "endpoint metrics, logs",
  },
  {
    name: "payment-service",
    kind: "simulated",
    owner: "revenue",
    version: "2026.05.4",
    status: "degraded",
    dependencies: ["payment-gateway"],
    signals: "endpoint metrics, traces, alerts",
  },
  {
    name: "inventory-service",
    kind: "simulated",
    owner: "warehouse",
    version: "2026.04.9",
    status: "running",
    dependencies: ["inventory-db"],
    signals: "endpoint metrics, db latency",
  },
];

function metricKey(serviceName, path, method = "GET") {
  return `${serviceName}|${method}|${path}`;
}

function getMetric(serviceName, path, method = "GET") {
  const key = metricKey(serviceName, path, method);
  if (!endpointMetrics.has(key)) {
    endpointMetrics.set(key, {
      service: serviceName,
      method,
      path,
      total: 0,
      ok: 0,
      clientErrors: 0,
      serverErrors: 0,
      durationSum: 0,
      durationCount: 0,
      slow: 0,
      lastStatus: 0,
      lastFailureAt: null,
      bucketCounts: Object.fromEntries(buckets.map((bucket) => [bucket, 0])),
    });
  }
  return endpointMetrics.get(key);
}

function observe(metric, status, durationSeconds) {
  metric.total += 1;
  metric.durationSum += durationSeconds;
  metric.durationCount += 1;
  metric.lastStatus = status;
  if (status >= 500) {
    metric.serverErrors += 1;
    metric.lastFailureAt = new Date().toISOString();
  } else if (status >= 400) {
    metric.clientErrors += 1;
  } else {
    metric.ok += 1;
  }
  if (durationSeconds >= 0.5) metric.slow += 1;

  for (const bucket of buckets) {
    if (durationSeconds <= bucket) metric.bucketCounts[bucket] += 1;
  }
}

function label(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function metrics() {
  const lines = [
    "# HELP http_requests_total Total HTTP requests.",
    "# TYPE http_requests_total counter",
  ];

  for (const metric of endpointMetrics.values()) {
    lines.push(`http_requests_total{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}",status="200"} ${metric.ok}`);
    lines.push(`http_requests_total{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}",status="400"} ${metric.clientErrors}`);
    lines.push(`http_requests_total{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}",status="500"} ${metric.serverErrors}`);
  }

  lines.push("# HELP http_request_duration_seconds HTTP request duration.");
  lines.push("# TYPE http_request_duration_seconds histogram");
  for (const metric of endpointMetrics.values()) {
    for (const bucket of buckets) {
      lines.push(`http_request_duration_seconds_bucket{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}",le="${bucket}"} ${metric.bucketCounts[bucket]}`);
    }
    lines.push(`http_request_duration_seconds_bucket{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}",le="+Inf"} ${metric.durationCount}`);
    lines.push(`http_request_duration_seconds_sum{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}"} ${metric.durationSum.toFixed(3)}`);
    lines.push(`http_request_duration_seconds_count{service="${label(metric.service)}",method="${metric.method}",path="${label(metric.path)}"} ${metric.durationCount}`);
  }

  lines.push("# HELP business_events_total Product and user journey counters.");
  lines.push("# TYPE business_events_total counter");
  lines.push(`business_events_total{event="login",outcome="success"} ${businessCounters.logins}`);
  lines.push(`business_events_total{event="checkout",outcome="success"} ${businessCounters.checkouts}`);
  lines.push(`business_events_total{event="payment",outcome="success"} ${businessCounters.payments}`);
  lines.push(`business_events_total{event="payment",outcome="failure"} ${businessCounters.paymentFailures}`);
  lines.push(`business_events_total{event="cart",outcome="abandoned"} ${businessCounters.abandonedCarts}`);

  lines.push("# HELP deployment_info Current demo deployment versions.");
  lines.push("# TYPE deployment_info gauge");
  for (const item of serviceCatalog) {
    lines.push(`deployment_info{service="${label(item.name)}",version="${label(item.version)}",status="${label(item.status)}"} 1`);
  }

  const memory = process.memoryUsage();
  lines.push("# HELP node_process_memory_bytes Sample process memory usage.");
  lines.push("# TYPE node_process_memory_bytes gauge");
  lines.push(`node_process_memory_bytes{service="${service}",type="rss"} ${memory.rss}`);
  lines.push(`node_process_memory_bytes{service="${service}",type="heap_used"} ${memory.heapUsed}`);
  return `${lines.join("\n")}\n`;
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(body));
}

function writeLog(entry) {
  const line = `${JSON.stringify(entry)}\n`;
  console.log(line.trim());

  if (!logstashHost) return;

  const socket = net.createConnection({ host: logstashHost, port: logstashPort }, () => {
    socket.end(line);
  });

  socket.on("error", () => {
    socket.destroy();
  });
}

function rememberIncident(entry) {
  if (entry.status < 500 && entry.duration_ms < 500) return;

  incidentHistory.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    severity: entry.status >= 500 ? "critical" : "warning",
    type: entry.mode,
    service: entry.service,
    path: entry.path,
    status: entry.status,
    duration_ms: entry.duration_ms,
    message: entry.status >= 500 ? `${entry.service} returned a 5xx` : `${entry.service} crossed latency SLO`,
    timestamp: entry.timestamp,
    runbook: entry.status >= 500 ? "Check recent deploys, payment failures, and error logs." : "Inspect p95 latency and database/external spans.",
  });

  incidentHistory.splice(40);
}

function statusForPlan(plan) {
  if (plan.forceFailure) return 500;
  if (plan.forceClientError) return 400;
  if (plan.failureRate && Math.random() < plan.failureRate) return 500;
  if (plan.clientErrorRate && Math.random() < plan.clientErrorRate) return 400;
  return 200;
}

function durationForPlan(plan) {
  if (plan.forceSlow) return Math.floor(700 + Math.random() * 520);
  const base = plan.baseMs ?? 55;
  const jitter = plan.jitterMs ?? 160;
  return Math.floor(base + Math.random() * jitter);
}

function updateBusinessCounters(path, status) {
  if (status >= 500 && path.includes("payment")) businessCounters.paymentFailures += 1;
  if (status < 400 && path.includes("login")) businessCounters.logins += 1;
  if (status < 400 && path.includes("checkout")) businessCounters.checkouts += 1;
  if (status < 400 && path.includes("payment")) businessCounters.payments += 1;
  if (path.includes("cart") && Math.random() < 0.2) businessCounters.abandonedCarts += 1;
}

function recordRequest(plan) {
  const serviceName = plan.service || service;
  const method = plan.method || "GET";
  const path = plan.path || "/";
  const durationMs = durationForPlan(plan);
  const status = statusForPlan(plan);
  const metric = getMetric(serviceName, path, method);

  observe(metric, status, durationMs / 1000);
  updateBusinessCounters(path, status);

  const timestamp = new Date().toISOString();
  const entry = {
    service: serviceName,
    status,
    path,
    method,
    mode: plan.mode || "direct",
    severity: status >= 500 ? "error" : status >= 400 || durationMs >= 500 ? "warn" : "info",
    duration_ms: durationMs,
    trace_id: `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`,
    dependency: plan.dependency || null,
    timestamp,
  };

  writeLog(entry);
  rememberIncident(entry);

  const span = tracer.startSpan(`${method} ${path}`, {
    attributes: {
      "service.name": serviceName,
      "http.route": path,
      "http.method": method,
      "http.status_code": status,
      "request.mode": entry.mode,
      "request.duration_ms": durationMs,
      "dependency.name": plan.dependency || "",
    },
  });
  if (status >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: "Synthetic failure" });
  }
  span.end();

  return entry;
}

function trafficPlan(type) {
  const scenarios = {
    healthy: [
      { service: "checkout-api", path: "/api/products", mode: "healthy", baseMs: 30, jitterMs: 80 },
      { service: "auth-service", path: "/api/login", method: "POST", mode: "healthy", baseMs: 35, jitterMs: 90 },
    ],
    slow: [
      { service: "checkout-api", path: "/api/checkout", method: "POST", mode: "slow", forceSlow: true, dependency: "inventory-db" },
      { service: "inventory-service", path: "/api/inventory/reserve", method: "POST", mode: "slow", forceSlow: true, dependency: "inventory-db" },
    ],
    fail: [
      { service: "payment-service", path: "/api/payment/charge", method: "POST", mode: "fail", forceFailure: true, dependency: "payment-gateway" },
      { service: "checkout-api", path: "/api/checkout", method: "POST", mode: "fail", forceFailure: true, dependency: "payment-service" },
    ],
    login: [
      { service: "auth-service", path: "/api/login", method: "POST", mode: "login", baseMs: 45, jitterMs: 130, clientErrorRate: 0.08 },
      { service: "auth-service", path: "/api/session/refresh", mode: "login", baseMs: 25, jitterMs: 70 },
    ],
    checkout: [
      { service: "checkout-api", path: "/api/cart", method: "POST", mode: "checkout", baseMs: 50, jitterMs: 160 },
      { service: "checkout-api", path: "/api/checkout", method: "POST", mode: "checkout", baseMs: 90, jitterMs: 240, failureRate: 0.06 },
      { service: "inventory-service", path: "/api/inventory/reserve", method: "POST", mode: "checkout", baseMs: 65, jitterMs: 180 },
    ],
    payment: [
      { service: "payment-service", path: "/api/payment/charge", method: "POST", mode: "payment", baseMs: 110, jitterMs: 360, failureRate: 0.22, dependency: "payment-gateway" },
      { service: "checkout-api", path: "/api/orders", method: "POST", mode: "payment", baseMs: 80, jitterMs: 220 },
    ],
    database: [
      { service: "inventory-service", path: "/api/inventory/search", mode: "database", forceSlow: true, dependency: "inventory-db" },
      { service: "checkout-api", path: "/api/products", mode: "database", baseMs: 220, jitterMs: 360, dependency: "catalog-db" },
    ],
    outage: [
      { service: "payment-service", path: "/api/payment/charge", method: "POST", mode: "outage", forceFailure: true, forceSlow: true, dependency: "payment-gateway" },
      { service: "checkout-api", path: "/api/checkout", method: "POST", mode: "outage", forceFailure: true, dependency: "payment-service" },
    ],
    recovery: [
      { service: "checkout-api", path: "/api/checkout", method: "POST", mode: "recovery", baseMs: 50, jitterMs: 130 },
      { service: "payment-service", path: "/api/payment/charge", method: "POST", mode: "recovery", baseMs: 70, jitterMs: 160, failureRate: 0.02 },
    ],
    mixed: [
      { service: "checkout-api", path: "/api/products", mode: "mixed", baseMs: 30, jitterMs: 140 },
      { service: "auth-service", path: "/api/login", method: "POST", mode: "mixed", baseMs: 35, jitterMs: 130, clientErrorRate: 0.05 },
      { service: "checkout-api", path: "/api/checkout", method: "POST", mode: "mixed", baseMs: 80, jitterMs: 260, failureRate: 0.08 },
      { service: "payment-service", path: "/api/payment/charge", method: "POST", mode: "mixed", baseMs: 110, jitterMs: 360, failureRate: 0.12, dependency: "payment-gateway" },
      { service: "inventory-service", path: "/api/inventory/search", mode: "mixed", baseMs: 70, jitterMs: 220 },
      { service: "checkout-api", path: "/slow", mode: "mixed", forceSlow: true },
      { service: "checkout-api", path: "/fail", mode: "mixed", forceFailure: true },
    ],
  };

  const choices = scenarios[type] || scenarios.mixed;
  return () => choices[Math.floor(Math.random() * choices.length)];
}

function endpointSummary() {
  return Array.from(endpointMetrics.values())
    .map((metric) => {
      const avgMs = metric.durationCount ? (metric.durationSum / metric.durationCount) * 1000 : 0;
      const errorCount = metric.clientErrors + metric.serverErrors;
      return {
        service: metric.service,
        method: metric.method,
        path: metric.path,
        total: metric.total,
        ok: metric.ok,
        client_errors: metric.clientErrors,
        server_errors: metric.serverErrors,
        error_rate: metric.total ? errorCount / metric.total : 0,
        avg_ms: Math.round(avgMs),
        slow: metric.slow,
        status: metric.serverErrors ? "degraded" : metric.slow ? "slow" : "healthy",
        last_failure_at: metric.lastFailureAt,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function serviceSummary() {
  const endpoints = endpointSummary();
  return serviceCatalog.map((item) => {
    const rows = endpoints.filter((row) => row.service === item.name);
    const total = rows.reduce((sum, row) => sum + row.total, 0);
    const errors = rows.reduce((sum, row) => sum + row.server_errors + row.client_errors, 0);
    const avgMs = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.avg_ms, 0) / rows.length) : 0;
    return {
      ...item,
      requests: total,
      errors,
      avg_ms: avgMs,
      health: item.status === "degraded" || errors > 0 ? "watch" : "good",
    };
  });
}

function sloSummary() {
  const endpoints = endpointSummary();
  const total = endpoints.reduce((sum, row) => sum + row.total, 0);
  const failures = endpoints.reduce((sum, row) => sum + row.server_errors, 0);
  const slow = endpoints.reduce((sum, row) => sum + row.slow, 0);
  const availability = total ? ((total - failures) / total) * 100 : 100;
  const latencyCompliance = total ? ((total - slow) / total) * 100 : 100;
  const errorBudgetRemaining = Math.max(0, 100 - Math.max(0, 99.9 - availability) * 100);
  return {
    availability: Number(availability.toFixed(2)),
    availability_target: 99.9,
    latency_compliance: Number(latencyCompliance.toFixed(2)),
    latency_target_ms: 500,
    error_rate: total ? Number(((failures / total) * 100).toFixed(2)) : 0,
    error_budget_remaining: Number(errorBudgetRemaining.toFixed(1)),
    burn_rate: total ? Number(((failures + slow) / total).toFixed(2)) : 0,
    total_requests: total,
  };
}

function traceSummary() {
  return endpointSummary()
    .slice(0, 8)
    .map((row) => ({
      service: row.service,
      operation: `${row.method} ${row.path}`,
      avg_ms: row.avg_ms,
      slow: row.slow,
      errors: row.server_errors,
      dependency: row.path.includes("payment") ? "payment-gateway" : row.path.includes("inventory") ? "inventory-db" : "none",
    }));
}

async function logSummary() {
  const fallback = incidentHistory.slice(0, 8).map((item) => ({
    service: item.service,
    status: item.status,
    path: item.path,
    severity: item.severity,
    duration_ms: item.duration_ms,
    timestamp: item.timestamp,
  }));
  const searchUrl = `${elasticsearchUrl}/app-logs-*/_search`;
  const body = {
    size: 8,
    sort: [{ "@timestamp": "desc" }],
    aggs: {
      total_logs: { value_count: { field: "status" } },
      errors: { filter: { range: { status: { gte: 500 } } } },
      slow: { filter: { range: { duration_ms: { gte: 500 } } } },
      warnings: { filter: { term: { severity: "warn" } } },
    },
  };

  try {
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Elasticsearch returned ${response.status}`);
    const payload = await response.json();
    return {
      total: payload.hits.total.value,
      errors: payload.aggregations.errors.doc_count,
      slow: payload.aggregations.slow.doc_count,
      warnings: payload.aggregations.warnings.doc_count,
      recent: payload.hits.hits.map((hit) => hit._source),
    };
  } catch (error) {
    return {
      error: error.message,
      total: fallback.length,
      errors: fallback.filter((row) => row.status >= 500).length,
      slow: fallback.filter((row) => row.duration_ms >= 500).length,
      warnings: fallback.filter((row) => row.severity === "warn").length,
      recent: fallback,
    };
  }
}

function seedInitialData() {
  const plan = trafficPlan("mixed");
  for (let index = 0; index < 12; index += 1) {
    recordRequest(plan());
  }
}

seedInitialData();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (url.pathname === "/metrics") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "text/plain; version=0.0.4",
    });
    res.end(metrics());
    return;
  }

  if (url.pathname === "/health") {
    json(res, 200, { status: "ok", service, version: demoVersion });
    return;
  }

  if (url.pathname === "/simulate") {
    const count = Math.min(Math.max(Number(url.searchParams.get("count") || 50), 1), 500);
    const type = url.searchParams.get("type") || "mixed";
    const plan = trafficPlan(type);
    const results = Array.from({ length: count }, () => recordRequest(plan()));
    const ok = results.filter((item) => item.status < 400).length;
    const errors = results.filter((item) => item.status >= 500).length;
    const slow = results.filter((item) => item.duration_ms >= 500).length;

    json(res, 200, {
      service,
      type,
      requested: count,
      ok,
      errors,
      slow,
      message: `Generated ${count} ${type} requests`,
    });
    return;
  }

  if (url.pathname === "/api/incidents") {
    json(res, 200, { incidents: incidentHistory });
    return;
  }

  if (url.pathname === "/api/service-health") {
    const endpoints = endpointSummary();
    const counters = endpoints.reduce(
      (acc, row) => {
        acc.total += row.total;
        acc.ok += row.ok;
        acc.errors += row.server_errors;
        return acc;
      },
      { total: 0, ok: 0, errors: 0 }
    );
    json(res, 200, {
      service,
      status: "up",
      version: demoVersion,
      counters,
      duration_count: counters.total,
      logstash: Boolean(logstashHost),
      tracing: Boolean(otlpEndpoint),
    });
    return;
  }

  if (url.pathname === "/api/log-summary") {
    json(res, 200, await logSummary());
    return;
  }

  if (url.pathname === "/api/endpoint-metrics") {
    json(res, 200, { endpoints: endpointSummary(), business: businessCounters });
    return;
  }

  if (url.pathname === "/api/services") {
    json(res, 200, { services: serviceSummary() });
    return;
  }

  if (url.pathname === "/api/slo") {
    json(res, 200, sloSummary());
    return;
  }

  if (url.pathname === "/api/deployments") {
    json(res, 200, { deployments: deploymentEvents });
    return;
  }

  if (url.pathname === "/api/trace-summary") {
    json(res, 200, { traces: traceSummary() });
    return;
  }

  if (url.pathname === "/api/system") {
    const memory = process.memoryUsage();
    json(res, 200, {
      uptime_seconds: Math.round(process.uptime()),
      rss_mb: Math.round(memory.rss / 1024 / 1024),
      heap_used_mb: Math.round(memory.heapUsed / 1024 / 1024),
      endpoints: endpointMetrics.size,
    });
    return;
  }

  const knownPlan = {
    path: url.pathname,
    method: req.method,
    mode: "direct",
    forceFailure: url.pathname === "/fail",
    forceSlow: url.pathname === "/slow",
    baseMs: 35,
    jitterMs: 140,
  };
  const result = recordRequest(knownPlan);

  setTimeout(() => {
    json(res, result.status, result);
  }, result.duration_ms);
});

server.listen(port, () => {
  console.log(`${service} listening on ${port}`);
});
