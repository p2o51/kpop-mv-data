# Public vs private

This repository is the **public facts layer** only.

## Public (this repo)

May publish:

- `video_id`, `channel_id`, artist/group/company registry fields
- `published_at`, `snapshot_at`
- `view_count`, `like_count`, `comment_count`
- `data_source`, `collector_version`
- daily growth derived only from consecutive public snapshots
- collection completeness / missing-snapshot reports
- raw snapshot downloads + checksums

Must **not** publish:

- “注水量” / paid views / sponsored views
- organic vs non-organic labels
- Charts-unrecognized estimates
- artist or company promotion rankings
- any judgmental score built by merging Charts with API stats

## Private (separate repo / local only)

A private analysis project may read public snapshots and compute estimates offline.
That code, dashboards, and outputs must never run in this repo’s public Actions,
never upload as public artifacts, and never leak into commit messages or issues.

Recommended private flow:

```text
public collector → public snapshots (R2 / Releases)
                 → private analysis (local / Access-gated)
                 → private dashboard
```

## Wording

Even privately, prefer:

- Charts-unrecognized views (estimate)
- non-chart-counted views (estimate)

Avoid absolute claims of “ad views” unless YouTube itself labels them that way.
