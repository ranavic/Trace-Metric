# Learning Guide

This project is easiest to understand if you follow the data.

## 1. The Sample Service

The sample service is a tiny Node app named `checkout-api`. It gives us something real to observe.

Important endpoints:

- `/health` returns a basic health check.
- `/metrics` returns Prometheus metrics.
- `/slow` creates slow responses.
- `/fail` creates failed responses.
- `/simulate?count=80&type=mixed` generates multiple requests from the browser or script.
- `/api/log-summary` returns log totals from Elasticsearch.
- `/api/incidents` returns recent synthetic slow/failure incidents.
- `/api/service-health` returns live service status and signal availability.

Why this matters: observability tools need signals. A service that can be healthy, slow, and broken gives you those signals on demand.

## 2. Metrics With Prometheus

Prometheus scrapes the sample service.

Scraping means Prometheus calls the service's `/metrics` endpoint every few seconds. The service does not push metrics to Prometheus in this project.

The project tracks:

- `http_requests_total`
- `http_request_duration_seconds`

`http_requests_total` separates successful `200` responses from failed `500` responses. `http_request_duration_seconds` is a histogram used for latency buckets and p95 latency.

Useful PromQL examples:

```text
http_requests_total
rate(http_requests_total[1m])
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
```

## 3. Dashboards With Grafana

Grafana reads from Prometheus and turns time-series metrics into charts.

In this project, Grafana is provisioned automatically from files under:

```text
observability/grafana/provisioning
```

That means the dashboard setup is stored as code instead of being clicked together manually.

The provisioned dashboard is `Application Overview`. It currently shows:

- request rate from `sum(rate(http_requests_total[1m])) by (service)`
- p95 latency from the histogram quantile query

## 4. Alerts With Alertmanager

Prometheus decides when an alert should fire. Alertmanager receives, groups, and routes those alerts.

The current alert rules are:

- `HighErrorRate`: fires when 5xx response rate stays above the configured threshold.
- `HighLatencyP95`: fires when p95 latency stays above 500 ms.

The key lesson: Prometheus evaluates the rule, Alertmanager handles the notification workflow.

## 5. Logs With ELK

The sample service writes JSON logs. It also sends those logs to Logstash over TCP when running in Docker Compose.

The path is:

```text
sample-service -> Logstash -> Elasticsearch -> Kibana
```

Logs answer questions such as:

- Which endpoint failed?
- What status code happened?
- When did it happen?
- How long did the request take?

In this project, one backend request writes one JSON log line. The searchable logs live in Elasticsearch under `app-logs-*`. Because the Docker Compose file does not define a persistent Elasticsearch volume, these logs should be treated as demo/session data.

## 6. Tracing With Jaeger

Jaeger is included and actively receives traces. The sample service is instrumented with OpenTelemetry libraries inside the Node app and exports spans to Jaeger through OTLP HTTP.

When you generate traffic from the frontend, every generated request creates a trace span such as `HTTP /slow` or `HTTP /fail`. Jaeger is the Docker container that receives and displays those spans; OpenTelemetry is not a separate container in this project.

## 7. Custom Webapp Tabs

The custom frontend is the main learning interface. It links to the real tools and also imports live data directly.

- **Overview**: high-level status cards for requests, p95 latency, errors, active alerts, log totals, and target health.
- **Live metrics**: detailed Prometheus values for 200 responses, 500 responses, request rate, p95 latency, and a native request chart.
- **Logs**: log summary counts and recent request rows from Elasticsearch.
- **Alerts**: alert rule cards, active Alertmanager feed, and generated incident history.
- **Tracing**: the OpenTelemetry to Jaeger flow and trace status.
- **Services**: observed service map for `checkout-api` and stack tools.
- **SLO**: availability, latency, and 5xx reliability targets.
- **Deployments**: controlled simulation events such as traffic spike, failure simulation, and slow simulation.
- **Runbook**: project review checklist.
- **Architecture**: signal flow from the service to metrics, logs, alerts, and dashboards.

## 8. SLO And Error Budget

An SLO is a reliability target. In this project, the SLO tab shows:

- `99.9%` availability target
- `500 ms` p95 latency limit
- `< 1%` 5xx target

An error budget is the amount of failure allowed before the target is broken. For example, a 99.9% availability target allows about 0.1% failure. The alert rules connect backend symptoms to those reliability targets.

## 9. How To Demo It

Start the stack:

```powershell
docker compose up --build
```

Generate traffic from the webapp traffic simulator, or run:

```powershell
.\scripts\generate-traffic.ps1 -Requests 120
```

Then inspect:

- Prometheus targets at `http://localhost:9090/targets`
- Grafana at `http://localhost:3000`
- Alertmanager at `http://localhost:9093`
- Kibana at `http://localhost:5601`
- Jaeger at `http://localhost:16686`

## 10. What To Say In A Presentation

This project centralizes observability signals for a demo application. Prometheus scrapes metrics, Grafana visualizes them, Prometheus rules detect bad conditions, Alertmanager groups alerts, ELK stores and searches logs, and Jaeger shows request traces generated by OpenTelemetry. The custom webapp acts as a polished overview layer with live metrics, logs, alerts, tracing, SLO, service, deployment, runbook, and architecture views.
