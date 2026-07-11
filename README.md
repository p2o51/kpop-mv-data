# kpop-mv-data

Open **K-pop MV public stats** infrastructure. Girl-group first.

This repo publishes **facts only**:

- registry of companies / groups / channels / videos
- YouTube public `view_count` / `like_count` / `comment_count` snapshots
- methodology, schemas, checksums

It does **not** publish promotion estimates, “注水量”, organic/non-organic labels, or Charts-unrecognized rankings. Those belong in a separate private analysis project that only *reads* this data.

## Layout

```text
registry/        # human-maintained catalog (PR-friendly YAML)
methodology/     # what we collect, what we refuse to publish
schemas/         # JSON Schema for snapshots & manifests
collector/       # Cloudflare Worker + D1 + R2 cron collector
web/             # static facts frontend (Astro)
scripts/         # registry validation
manifests/       # daily export indexes (checksums, not raw dumps)
```

## Quick start

```bash
# validate registry
npm run validate

# discover uploads then keep only girl-group main MVs
npm run discover
npm run clean-videos

# sync registry → D1
npm run sync-sql > /tmp/kpop-sync.sql
cd collector && npx wrangler d1 execute kpop-mv --remote --file=/tmp/kpop-sync.sql
```

### Manual collection (authenticated)

```bash
# secrets live in collector/.dev.vars (gitignored) and Cloudflare secrets
curl -X POST 'https://kpop-mv-collector.<you>.workers.dev/run?force=all' \
  -H "Authorization: Bearer $COLLECTOR_RUN_SECRET"
```

`/latest` is public and returns **active** main-MV snapshots only.

## v0 scope

| | Target |
| --- | ---: |
| Channels | ~20 seed (Big 4 + mid-tier + 1theK) |
| Acts | ~40 girl groups / female soloists |
| Cadence | 10m → hourly → 6h → daily by MV age |
| Public outputs | snapshots + registry + manifests |

See `methodology/scope-v0.md`.

## Architecture

```text
registry YAML
    ↓
Cloudflare Cron (every 10m)
    ↓
videos.list (≤50 ids / 1 quota unit)
    ↓
D1 latest + R2 hourly JSONL
    ↓
daily manifest → GitHub Release / manifests/
    ↓
Astro static site (facts only)
```

Private analysis (separate repo):

```text
public snapshots → local/private Charts import → estimates → Access-gated dashboard
```

## Compliance note

YouTube API Services Terms restrict certain derived metrics (including paid/sponsored view estimation) and how API data may be stored or combined. Public “facts only” reduces product risk; it does not automatically make every private use compliant. Review current terms before scaling.

## License

MIT for code and registry structure. YouTube data remains subject to Google/YouTube terms.
