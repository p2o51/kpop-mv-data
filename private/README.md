# Private analysis (not this repo)

Keep promotion / Charts-unrecognized analysis in a **separate private repository**, for example:

```text
kpop-mv-private-analysis
├── chart-importer/
├── matching/
├── metrics/
├── dashboard/
└── private-overrides/
```

## Rules

1. Only **read** public snapshots from `kpop-mv-data` (R2 / Releases).
2. Never run private metrics in the public repo’s GitHub Actions.
3. Never upload private results as public Actions artifacts.
4. Do not put estimates in public Issues, commit messages, or Worker logs.
5. Gate any hosted dashboard with Cloudflare Access (or run locally only).

## Suggested metrics (private)

```text
non_chart_views  ≈ public_view_growth - chart_recognized_views
non_chart_ratio  ≈ non_chart_views / public_view_growth
```

Always attach confidence (`High` / `Medium` / `Low`) and never treat “not on Charts” as zero organic plays.

This folder is documentation only — no private code lives here.
