# DevOps Observability Platform Report

## Problem Statement

Modern applications can fail silently when teams lack centralized visibility into logs, metrics, latency, and failures. This project creates a free local observability platform to detect, inspect, and explain service problems.

## Objectives Covered

- Centralized logging with Elasticsearch, Logstash, and Kibana.
- Metrics monitoring with Prometheus.
- Dashboards with Grafana.
- Alerting with Alertmanager.
- Distributed tracing with OpenTelemetry and Jaeger.
- Unified custom webapp for an observability overview.
- Native traffic simulation for healthy, slow, failing, login, checkout, payment, database, outage, recovery, and mixed traffic.
- Endpoint-level metrics, business counters, service inventory, deployment context, and calculated SLO/error budget views.

## Architecture

```mermaid
flowchart LR
  Browser[User browser] --> UI[Custom webapp]
  UI --> Simulate[/Traffic simulator/]
  Simulate --> Sample

  Sample[Sample Node service] --> Metrics[/metrics]
  Prometheus -->|scrapes| Metrics
  Grafana --> Prometheus
  Prometheus --> Alertmanager

  Sample -->|JSON logs| Logstash
  Logstash --> Elasticsearch
  Kibana --> Elasticsearch

  Sample -->|OpenTelemetry OTLP HTTP| Jaeger[Jaeger all-in-one]
  UI --> Prometheus
  UI --> Alertmanager
  UI --> Elasticsearch
  UI --> Jaeger
```

## Components

| Component | Role |
| --- | --- |
| Custom webapp | Polished operational dashboard, traffic generator, and learning interface |
| Sample service | Demo `checkout-api` application that emits endpoint metrics, logs, incidents, SLO data, deployment context, business counters, and traces |
| Prometheus | Scrapes and stores metrics |
| Grafana | Visualizes Prometheus metrics |
| Alertmanager | Receives and groups alerts |
| Logstash | Receives and transforms JSON logs |
| Elasticsearch | Stores log data |
| Kibana | Searches and visualizes logs |
| Jaeger | Distributed tracing UI receiving OpenTelemetry spans |

## Custom Webapp Features

The frontend is implemented as a responsive single-page dashboard with working tabs for:

- Overview
- Live metrics
- Logs
- Alerts
- Tracing
- Services
- SLO
- Deployments
- Runbook
- Architecture

The webapp includes a native traffic generator with request amount and traffic type controls. Supported traffic types are:

- `Mixed traffic`
- `Healthy only`
- `Slow latency`
- `Failures`
- `Login journey`
- `Checkout journey`
- `Payment failures`
- `Database slowness`
- `Outage mode`
- `Recovery mode`

The frontend imports live data from Prometheus, Alertmanager, Elasticsearch-backed service APIs, and the sample service APIs. It renders native status cards, request charts, log rows, active alerts, incident history, trace summaries, endpoint tables, business counters, service inventory, SLO calculations, and deployment health context.

The tabs now have distinct operational responsibilities:

- **Overview**: total requests, p95 latency, errors, active alerts, target health, service version, log volume, and runtime memory.
- **Live metrics**: `200`, `400`, and `500` response counts, request rate, p95 latency, endpoint breakdown, business counters, and native request trend chart.
- **Logs**: total logs, warning logs, error logs, slow logs, recent JSON request rows, and Kibana filter examples.
- **Alerts**: alert rule state, active Alertmanager feed, generated incident history, severity, and runbook hints.
- **Tracing**: OpenTelemetry to Jaeger flow plus slow operation/dependency summaries.
- **Services**: service owner, status, version, dependencies, and signal coverage.
- **SLO**: availability, latency compliance, error budget remaining, burn rate, error rate, and measured request volume.
- **Deployments**: release timeline, status, and impact explanation.
- **Runbook**: investigation order from symptom to metrics, logs, traces, SLO, and deployment decision.
- **Architecture**: metrics, logs, traces, scenario simulation, and runbook data flow.

## Alert Demonstration

Use `/slow` to increase latency and `/fail` to increase error responses. Prometheus evaluates alert rules in `observability/prometheus/alert-rules.yml`, then sends firing alerts to Alertmanager.

In the verified run, `HighLatencyP95` reached firing state and appeared as an active alert in Alertmanager.

## Log Demonstration

The sample service sent JSON logs to Logstash. Logstash wrote them into Elasticsearch under `app-logs-*`, and Kibana Discover displayed the indexed documents.

Each backend request writes one JSON log line containing fields such as `service`, `status`, `path`, `method`, `mode`, `severity`, `duration_ms`, `trace_id`, `dependency`, and `timestamp`. The Docker Compose setup does not define a persistent Elasticsearch volume, so logs are suitable for local demo sessions rather than long-term retention.

## Tracing Demonstration

The sample service uses OpenTelemetry packages inside the Node app. Each request creates a span named for the route, such as `GET /api/products`, `POST /api/checkout`, `POST /api/payment/charge`, `GET /slow`, or `GET /fail`.

The service exports spans to Jaeger through OTLP HTTP using:

```text
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318
```

Jaeger displays traces for the `checkout-api` service at `http://localhost:16686`.

## SLO And Error Budget Demonstration

The SLO tab calculates reliability values from the generated request data:

- availability percentage
- percentage of requests under the `500 ms` latency target
- error budget remaining
- burn rate
- 5xx error rate
- total measured request volume

These values connect user-facing reliability expectations to backend measurements. The alert rules demonstrate what happens when latency or error rate starts burning the error budget.

## Free Stack

All project components are free to run locally:

- Grafana OSS
- Prometheus
- Alertmanager
- Elasticsearch basic local container
- Logstash
- Kibana
- Jaeger all-in-one
- Node.js sample service

## Completed Implementation

- Native frontend traffic generator with request amount and scenario-based traffic type controls.
- Endpoint-level metrics by service, path, method, status, request count, error rate, and average latency.
- Business counters for logins, checkouts, payments, payment failures, and abandoned carts.
- Calculated SLO cards for availability, latency compliance, error budget, burn rate, error rate, and measured requests.
- Service inventory for `checkout-api`, `auth-service`, `payment-service`, and `inventory-service`.
- Deployment health timeline for recent release context.
- Real log summary cards powered by Elasticsearch.
- Real incident history generated by slow and failing traffic.
- Native frontend chart rendered from Prometheus range data.
- Service health display from the sample service API.
- OpenTelemetry tracing from `checkout-api` to Jaeger.
- Responsive navigation with desktop sidebar and mobile burger menu.
- Overview, metrics, logs, alerts, tracing, services, SLO, deployments, runbook, and architecture tabs.
- Project PDF guides under `docs/` for separate tool access and full observability workflow.
