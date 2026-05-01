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

const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: service,
  }),
});
provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })));
provider.register();
const tracer = trace.getTracer(service);

const counters = {
  total: 0,
  ok: 0,
  errors: 0,
};

const buckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5];
const bucketCounts = Object.fromEntries(buckets.map((bucket) => [bucket, 0]));
const incidentHistory = [];
let durationSum = 0;
let durationCount = 0;

function observe(durationSeconds) {
  durationSum += durationSeconds;
  durationCount += 1;
  for (const bucket of buckets) {
    if (durationSeconds <= bucket) {
      bucketCounts[bucket] += 1;
    }
  }
}

function metrics() {
  const lines = [
    "# HELP http_requests_total Total HTTP requests.",
    "# TYPE http_requests_total counter",
    `http_requests_total{service="${service}",status="200"} ${counters.ok}`,
    `http_requests_total{service="${service}",status="500"} ${counters.errors}`,
    "# HELP http_request_duration_seconds HTTP request duration.",
    "# TYPE http_request_duration_seconds histogram",
  ];

  for (const bucket of buckets) {
    lines.push(`http_request_duration_seconds_bucket{service="${service}",le="${bucket}"} ${bucketCounts[bucket]}`);
  }

  lines.push(`http_request_duration_seconds_bucket{service="${service}",le="+Inf"} ${durationCount}`);
  lines.push(`http_request_duration_seconds_sum{service="${service}"} ${durationSum.toFixed(3)}`);
  lines.push(`http_request_duration_seconds_count{service="${service}"} ${durationCount}`);
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

function writeLog(status, durationMs, path, mode = "direct") {
  const entry = {
    service,
    status,
    path,
    mode,
    duration_ms: durationMs,
    timestamp: new Date().toISOString(),
  };
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

function rememberIncident(type, path, status, durationMs) {
  if (status < 500 && durationMs < 500) return;

  incidentHistory.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    service,
    path,
    status,
    duration_ms: durationMs,
    message: status >= 500 ? "HTTP 5xx failure generated" : "Slow request generated",
    timestamp: new Date().toISOString(),
  });

  incidentHistory.splice(30);
}

function recordRequest({ path, mode, forceFailure = false, forceSlow = false }) {
  const slow = forceSlow || path === "/slow";
  const failure = forceFailure || path === "/fail" || Math.random() < 0.08;
  const durationMs = slow ? Math.floor(650 + Math.random() * 260) : Math.floor(40 + Math.random() * 220);
  const status = failure ? 500 : 200;

  counters.total += 1;
  if (failure) counters.errors += 1;
  else counters.ok += 1;

  observe(durationMs / 1000);
  writeLog(status, durationMs, path, mode);
  rememberIncident(mode, path, status, durationMs);

  const span = tracer.startSpan(`HTTP ${path}`, {
    attributes: {
      "http.route": path,
      "http.status_code": status,
      "request.mode": mode,
      "request.duration_ms": durationMs,
    },
  });
  if (status >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: "Synthetic failure" });
  }
  span.end();

  return { service, status, path, duration_ms: durationMs, mode };
}

function trafficPlan(type) {
  const plans = {
    healthy: () => ({ path: "/", mode: "healthy" }),
    slow: () => ({ path: "/slow", mode: "slow", forceSlow: true }),
    fail: () => ({ path: "/fail", mode: "fail", forceFailure: true }),
    mixed: () => {
      const choices = [
        { path: "/", mode: "mixed" },
        { path: "/health", mode: "mixed" },
        { path: "/slow", mode: "mixed", forceSlow: true },
        { path: "/fail", mode: "mixed", forceFailure: true },
      ];
      return choices[Math.floor(Math.random() * choices.length)];
    },
  };

  return plans[type] || plans.mixed;
}

async function logSummary() {
  const searchUrl = `${elasticsearchUrl}/app-logs-*/_search`;
  const body = {
    size: 5,
    sort: [{ "@timestamp": "desc" }],
    aggs: {
      total_logs: { value_count: { field: "status" } },
      errors: { filter: { range: { status: { gte: 500 } } } },
      slow: { filter: { range: { duration_ms: { gte: 500 } } } },
    },
  };

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
    recent: payload.hits.hits.map((hit) => hit._source),
  };
}

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
    json(res, 200, { status: "ok", service });
    return;
  }

  if (url.pathname === "/simulate") {
    const count = Math.min(Math.max(Number(url.searchParams.get("count") || 50), 1), 500);
    const type = url.searchParams.get("type") || "mixed";
    const plan = trafficPlan(type);
    const results = Array.from({ length: count }, () => recordRequest(plan()));
    const ok = results.filter((item) => item.status === 200).length;
    const errors = results.length - ok;

    json(res, 200, {
      service,
      type,
      requested: count,
      ok,
      errors,
      message: `Generated ${count} ${type} requests`,
    });
    return;
  }

  if (url.pathname === "/api/incidents") {
    json(res, 200, { incidents: incidentHistory });
    return;
  }

  if (url.pathname === "/api/service-health") {
    json(res, 200, {
      service,
      status: "up",
      counters,
      duration_count: durationCount,
      logstash: Boolean(logstashHost),
      tracing: Boolean(otlpEndpoint),
    });
    return;
  }

  if (url.pathname === "/api/log-summary") {
    try {
      json(res, 200, await logSummary());
    } catch (error) {
      json(res, 503, { error: error.message, total: 0, errors: 0, slow: 0, recent: [] });
    }
    return;
  }

  const result = recordRequest({
    path: url.pathname,
    mode: "direct",
    forceFailure: url.pathname === "/fail",
    forceSlow: url.pathname === "/slow",
  });

  setTimeout(() => {
    json(res, result.status, result);
  }, result.duration_ms);
});

server.listen(port, () => {
  console.log(`${service} listening on ${port}`);
});
