# Screenshots

## Captured Screenshots

These screenshots were captured after the Docker stack was running and demo traffic had been generated.

- `docs/screenshots/grafana-application-overview.png`
- `docs/screenshots/prometheus-alerts.png`
- `docs/screenshots/alertmanager-active-alert.png`
- `docs/screenshots/kibana-app-logs.png`
- `docs/screenshots/jaeger-home.png`
- `docs/screenshots/all-six-features-overview.png`
- `docs/screenshots/all-six-features-logs-polished.png`
- `docs/screenshots/all-six-features-alerts.png`
- `docs/screenshots/all-six-features-tracing.png`
- `docs/screenshots/all-six-features-mobile.png`
- `docs/screenshots/burger-image-icon-mobile.png`
- `docs/screenshots/burger-image-icon-menu-open.png`

## What They Prove

- Grafana: Prometheus metrics are charting in the `Application Overview` dashboard.
- Prometheus alerts: alert rules are loaded and evaluated.
- Alertmanager: the latency alert reached active/firing state.
- Kibana: application logs are searchable in `app-logs-*`.
- Jaeger: the tracing UI receives OpenTelemetry spans from `checkout-api`.
- Current webapp screenshots: native traffic generation, live overview cards, live log summaries, incident history, active alert feed, tracing status, responsive menu, and non-redundant navigation are implemented.
- Burger icon screenshots: the custom image-based mobile menu button and open menu state are implemented.

## Current Feature Coverage

The screenshot folder now keeps only the final UI screenshots and external tool proof screenshots:

- Overview cards for requests, p95 latency, errors, active alerts, target health, and log totals.
- Logs tab with Elasticsearch-backed totals and recent request rows.
- Alerts tab with Prometheus rule status, Alertmanager feed, and generated incident history.
- Tracing tab with the OpenTelemetry to Jaeger path and trace status.
- Mobile responsive menu with the custom burger image icon.
- External proof screens for Grafana, Prometheus, Alertmanager, Kibana, and Jaeger.
