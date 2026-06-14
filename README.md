# DevOps Observability Platform

This project turns the PDF brief into a free local observability platform. It has two parts:

- A custom `Trace & Metrics` dashboard UI in `index.html`, styled after the attached reference image but focused on the real observability stack.
- Open-source observability infrastructure using Prometheus, Grafana, Alertmanager, ELK, Jaeger, and a tiny Node sample service.

## What Each Tool Does

Prometheus collects numeric metrics such as request rate, error rate, and latency.

Grafana visualizes those Prometheus metrics in dashboards.

Alertmanager receives alerts from Prometheus and groups/routes them.

Elasticsearch stores logs, Logstash receives and transforms logs, and Kibana visualizes those logs. The sample service sends JSON log lines to Logstash over TCP.

Jaeger receives OpenTelemetry traces from the sample service through OTLP HTTP.

The sample service exposes:

- `http://localhost:3001/health`
- `http://localhost:3001/metrics`
- `http://localhost:3001/slow`
- `http://localhost:3001/fail`
- `http://localhost:3001/api/endpoint-metrics`
- `http://localhost:3001/api/services`
- `http://localhost:3001/api/slo`
- `http://localhost:3001/api/deployments`
- `http://localhost:3001/api/trace-summary`

## Run The Custom Webapp

Open `index.html` in a browser. No install step is required.

The frontend includes responsive navigation, the custom burger image icon, and working tabs for overview, metrics, logs, alerts, tracing, services, SLOs, deployments, runbooks, and architecture.

It also includes a native traffic generator form. Choose the number of requests and the traffic type: `Mixed traffic`, `Healthy only`, `Slow latency`, `Failures`, `Login journey`, `Checkout journey`, `Payment failures`, `Database slowness`, `Outage mode`, or `Recovery mode`. Generated traffic updates Prometheus metrics, Logstash/Elasticsearch logs, incident history, SLO calculations, deployment context, service health, business counters, and Jaeger traces.

Each dashboard tab now has its own operational focus:

- Metrics: endpoint-by-endpoint traffic, 4xx/5xx split, average latency, and business counters.
- Logs: severity, warning/error counts, slow logs, and Kibana filters.
- Alerts: active Alertmanager alerts and synthetic incident history with runbook hints.
- Tracing: operation-level trace summaries and dependency context.
- Services: observed service inventory with owner, status, version, dependencies, and signals.
- SLO: availability, latency compliance, error budget, burn rate, and measured request volume.
- Deployments: release timeline and impact context.

## Run The Observability Stack

You need Docker Desktop installed and running.

```powershell
docker compose up --build
```

Then open:

- Custom app: `index.html`
- Sample service: `http://localhost:3001/health`
- Prometheus: `http://localhost:9090`
- Alertmanager: `http://localhost:9093`
- Grafana: `http://localhost:3000` with `admin` / `admin`
- Kibana: `http://localhost:5601`
- Jaeger: `http://localhost:16686`

To stop the running containers without deleting the project files:

```powershell
docker compose stop
```

## Generate Demo Traffic

Open these URLs a few times:

```text
http://localhost:3001/
http://localhost:3001/slow
http://localhost:3001/fail
```

Prometheus will scrape `/metrics`, Grafana will show request rate and p95 latency, and Prometheus will trigger alerts when the error rate or p95 latency stays high.

Or run the included traffic script:

```powershell
.\scripts\generate-traffic.ps1 -Requests 120
```

This script repeatedly calls healthy, slow, and failing endpoints so the dashboards and alerts have data to show.

## Learning Files

- `docs/LEARNING_GUIDE.md` explains how each observability signal moves through the system.
- `docs/PROJECT_REPORT.md` gives you a submission-friendly project report.
- `docs/SCREENSHOTS.md` tracks screenshot deliverables.

## Verified Demo Status

The full Docker stack has been started successfully. Demo traffic was generated from the frontend, Prometheus scraped metrics, Grafana displayed charts, Alertmanager received alerts, Kibana showed `app-logs-*` documents, and Jaeger received `checkout-api` traces.

## Architecture

```mermaid
flowchart LR
  User[Browser] --> UI[Custom dashboard UI]
  User --> Grafana
  User --> Kibana
  User --> Jaeger

  Sample[Sample Node service] --> Metrics[/metrics endpoint]
  Prometheus --> Metrics
  Prometheus --> Alertmanager
  Grafana --> Prometheus

  Sample --> Logs[JSON logs]
  Logs --> Logstash
  Logstash --> Elasticsearch
  Kibana --> Elasticsearch
```

## Deliverables Covered

- Architecture diagram: included above.
- Dashboard screenshots: capture the custom UI and Grafana after running locally.
- Alert demonstration: use `/slow` and `/fail`, then watch Prometheus and Alertmanager.
- GitHub repository: this folder is ready to push.
- Documentation: this README.

## Current Project Structure

```text
.
+-- index.html
+-- styles.css
+-- app.js
+-- docker-compose.yml
+-- sample-service/
+-- observability/
+-- scripts/
+-- docs/
```
