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
- `/api/endpoint-metrics` returns endpoint-level traffic, error, latency, and business counters.
- `/api/services` returns service inventory, ownership, dependencies, versions, and signal coverage.
- `/api/slo` returns calculated availability, latency compliance, error budget, burn rate, and request volume.
- `/api/deployments` returns recent deployment context.
- `/api/trace-summary` returns operation and dependency summaries for the tracing tab.

Why this matters: observability tools need signals. A service that can be healthy, slow, and broken gives you those signals on demand.

The simulator can produce several scenarios:

- `mixed`: a realistic blend of product, login, checkout, payment, slow, and failed calls.
- `healthy`: mostly fast successful traffic.
- `slow`: high-latency checkout and inventory calls.
- `fail`: direct 5xx failures.
- `login`: authentication and session activity, including some 4xx-style client errors.
- `checkout`: cart, checkout, and inventory reservation traffic.
- `payment`: payment gateway failures and order creation traffic.
- `database`: inventory/catalog-style slowness.
- `outage`: payment and checkout failures at the same time.
- `recovery`: mostly healthy traffic after an incident.

## 2. Metrics With Prometheus

Prometheus scrapes the sample service.

Scraping means Prometheus calls the service's `/metrics` endpoint every few seconds. The service does not push metrics to Prometheus in this project.

The project tracks:

- `http_requests_total`
- `http_request_duration_seconds`
- `business_events_total`
- `deployment_info`
- `node_process_memory_bytes`

`http_requests_total` separates `200`, `400`, and `500` responses by `service`, `method`, and `path`. `http_request_duration_seconds` is a histogram used for latency buckets and p95 latency. `business_events_total` tracks product-style counters such as logins, checkouts, payments, payment failures, and abandoned carts.

Useful PromQL examples:

```text
http_requests_total
rate(http_requests_total[1m])
sum(rate(http_requests_total[1m])) by (service)
sum(http_requests_total) by (service, path, status)
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))
business_events_total
```

## 3. Dashboards With Grafana

Grafana reads from Prometheus and turns time-series metrics into charts.

In this project, Grafana is provisioned automatically from files under:

```text
observability/grafana/provisioning
```

That means the dashboard setup is stored as code instead of being clicked together manually.

The provisioned dashboard is `Application Overview`. It shows:

- request rate by service
- p95 latency by service
- endpoint totals by status
- 5xx error ratio by service
- business events
- sample service memory

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
- Was it `info`, `warn`, or `error` severity?
- Which dependency was involved?

In this project, one backend request writes one JSON log line. Each row can include `service`, `status`, `path`, `method`, `mode`, `severity`, `duration_ms`, `trace_id`, `dependency`, and `timestamp`. The searchable logs live in Elasticsearch under `app-logs-*`. Because the Docker Compose file does not define a persistent Elasticsearch volume, these logs should be treated as demo/session data.

## 6. Tracing With Jaeger

Jaeger is included and actively receives traces. The sample service is instrumented with OpenTelemetry libraries inside the Node app and exports spans to Jaeger through OTLP HTTP.

When you generate traffic from the frontend, every generated request creates a trace span such as `POST /api/checkout`, `POST /api/payment/charge`, `GET /api/inventory/search`, `GET /slow`, or `GET /fail`. Jaeger is the Docker container that receives and displays those spans; OpenTelemetry is not a separate container in this project.

## 7. Custom Webapp Tabs

The custom frontend is the main learning interface. It links to the real tools and also imports live data directly.

- **Overview**: high-level status cards for requests, p95 latency, errors, active alerts, log totals, target health, version, and runtime memory.
- **Live metrics**: detailed Prometheus values for `200`, `400`, and `500` responses, request rate, p95 latency, endpoint breakdown, business counters, and a native request chart.
- **Logs**: log summary counts, warning/error/slow counts, recent request rows, and Kibana filter examples.
- **Alerts**: alert rule cards, active Alertmanager feed, generated incident history, severity, and runbook hints.
- **Tracing**: the OpenTelemetry to Jaeger flow, trace status, slow operations, and dependency context.
- **Services**: service map for `checkout-api`, `auth-service`, `payment-service`, and `inventory-service`.
- **SLO**: calculated availability, latency compliance, error budget, burn rate, error rate, and request volume.
- **Deployments**: release timeline with status and impact context.
- **Runbook**: investigation checklist from symptom to metrics, logs, traces, SLO, and deployment decision.
- **Architecture**: signal flow from the service to metrics, logs, alerts, dashboards, traces, scenario simulation, and runbooks.

## 8. SLO And Error Budget

An SLO is a reliability target. In this project, the SLO tab calculates:

- availability percentage
- percentage of requests under 500 ms
- error budget remaining
- burn rate
- 5xx error rate
- total measured requests

An error budget is the amount of failure allowed before the target is broken. For example, a 99.9% availability target allows about 0.1% failure. Generate `outage` or `payment` traffic to see the error budget drop, then generate `recovery` traffic to demonstrate improvement.

## 9. How To Demo It

Start the stack:

```powershell
docker compose up --build
```

Generate traffic from the webapp traffic simulator. For the richest demo, use this order:

1. `healthy`
2. `checkout`
3. `payment`
4. `database`
5. `outage`
6. `recovery`

You can also run:

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

This project centralizes observability signals for a demo application. Prometheus scrapes endpoint and business metrics, Grafana visualizes them, Prometheus rules detect bad conditions, Alertmanager groups alerts, ELK stores and searches logs, and Jaeger shows request traces generated by OpenTelemetry. The custom webapp acts as a polished overview layer with live metrics, logs, alerts, tracing, SLO, service, deployment, runbook, and architecture views.
