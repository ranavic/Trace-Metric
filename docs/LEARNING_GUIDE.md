# Learning Guide

This project is easiest to understand if you follow the data.

## 1. The Sample Service

The sample service is a tiny Node app. It gives us something to observe.

Important endpoints:

- `/health` returns a basic health check.
- `/metrics` returns Prometheus metrics.
- `/slow` creates slow responses.
- `/fail` creates failed responses.

Why this matters: observability tools need signals. A service that can be healthy, slow, and broken gives you those signals on demand.

## 2. Metrics With Prometheus

Prometheus scrapes the sample service.

Scraping means Prometheus calls the service's `/metrics` endpoint every few seconds. The service does not push metrics to Prometheus in this project.

The project tracks:

- `http_requests_total`
- `http_request_duration_seconds`

Counters are used for totals that go up over time. Histograms are used for latency buckets.

## 3. Dashboards With Grafana

Grafana reads from Prometheus and turns time-series metrics into charts.

In this project, Grafana is provisioned automatically from files under:

```text
observability/grafana/provisioning
```

That means the dashboard setup is stored as code instead of being clicked together manually.

## 4. Alerts With Alertmanager

Prometheus decides when an alert should fire. Alertmanager receives, groups, and routes those alerts.

The current alert rules are:

- `HighErrorRate`
- `HighLatencyP95`

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

## 6. Tracing With Jaeger

Jaeger is included as an advanced add-on. The sample service is instrumented with OpenTelemetry and exports spans to Jaeger through OTLP HTTP.

When you generate traffic from the frontend, every generated request creates a trace span such as `HTTP /slow` or `HTTP /fail`.

## 7. How To Demo It

Start the stack:

```powershell
docker compose up --build
```

Generate traffic:

```powershell
.\scripts\generate-traffic.ps1 -Requests 120
```

Then inspect:

- Prometheus targets at `http://localhost:9090/targets`
- Grafana at `http://localhost:3000`
- Alertmanager at `http://localhost:9093`
- Kibana at `http://localhost:5601`
- Jaeger at `http://localhost:16686`

## 8. What To Say In A Presentation

This project centralizes observability signals for a demo application. Prometheus scrapes metrics, Grafana visualizes them, Prometheus rules detect bad conditions, Alertmanager groups alerts, and ELK stores and searches logs. The custom webapp acts as a polished overview layer that explains the operational story in one place.
