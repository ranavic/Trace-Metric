# Screenshots

## Captured Screenshots

These screenshots were captured after the Docker stack was running and demo traffic had been generated.

- `docs/screenshots/custom-dashboard.png`
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

The older first-pass UI screenshot is also available at:

```text
ui-preview.png
```

## What They Prove

- Custom dashboard: the webapp UI is implemented.
- Frontend redesign: `Trace & Metrics` uses observability-focused tabs and responsive navigation.
- Grafana: Prometheus metrics are charting.
- Prometheus alerts: alert rules are loaded and evaluated.
- Alertmanager: the latency alert reached active/firing state.
- Kibana: application logs are searchable in `app-logs-*`.
- Jaeger: the tracing UI receives OpenTelemetry spans from `checkout-api`.
- All-six-features screenshots: native traffic generation, real log summaries, real incident history, real traces, responsive menu, and non-redundant navigation.
