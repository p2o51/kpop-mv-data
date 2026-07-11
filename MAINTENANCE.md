# Maintenance guide

System map:

```text
registry/*.yaml  ──sync-sql──▶  D1 (tracked_videos, channels)
                                   │
Cloudflare cron (*/10 min)         ▼
  collection tiers ──▶ D1 snapshots (30-day TTL) + R2 JSONL (permanent)
  auto-discovery   ──▶ D1 tracked_videos (discovered_by='worker-auto')
  daily archive tick ──▶ D1 purge + r2_objects manifest rows

GitHub Actions (once repo is pushed):
  validate-registry on PR · daily-manifest 00:25 UTC → manifests/
```

## What runs itself

- Collection: launch MVs every 10 min, early hourly, mid 6-hourly,
  archive daily 00:00 UTC (also purges D1 snapshots older than 30 days).
- Discovery: every channel's uploads checked hourly (6 shards × 10 min);
  new videos classified and tracked automatically within ~1 hour.
- Manifests: sha256 + row counts per R2 object, served at `/manifest?date=`.

## Weekly (~5 minutes)

```bash
# errors in recent runs? quota trend?
cd collector && npx wrangler d1 execute kpop-mv --remote --command \
  "SELECT substr(started_at,1,10) d, SUM(quota_units) units, \
          SUM(videos_attempted-videos_ok) failures, \
          SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) errored_runs \
   FROM job_runs GROUP BY d ORDER BY d DESC LIMIT 7"

# skim auto-discovered videos for misclassifications
curl -s https://kpop-mv-collector.<subdomain>.workers.dev/discovered | jq .
```

- `failures > 0` sustained for one video → it was deleted/privated: mark it
  `active: false` in `registry/videos.yaml` with a dated comment, sync.
- Quota budget: ~3,400/10,000 units/day at 330 videos + 72 channels.
  Discovery dominates (≈ channels × 24 units/day). If tight: drop
  discovery to every other shard tick before touching collection tiers.

## Monthly — formalize discovered videos into the registry

Auto-discovered rows live only in D1 until you fold them into YAML:

```bash
npm run discover && npm run clean-videos && npm run validate && npm run sync-sql
git diff registry/videos.yaml   # review before committing
```

`sync-sql` only deactivates rows with `discovered_by='registry'`; it never
touches `worker-auto` rows, so running it is always safe.

## Event-driven playbook

**New group / new channel** (incl. Japanese sub-channels for JP releases):
1. Add company to `companies.yaml` if new, group to `groups.yaml`,
   channel to `channels.yaml` (get the real channel ID, then verify):
2. `npm run verify-channels && npm run validate`
3. `npm run sync-channels-sql` — discovery picks the channel up next shard.

**Group disbands / goes inactive**: set `status` in `groups.yaml`; leave its
videos active (archive tier keeps history at 1 unit/day per 50 videos).

**Agency change**: update `groups.yaml` + move channel `company` if the
channel migrates. MV hosting often changes with the agency — check whether
new releases appear on a different channel and register it.

**Comeback on a label channel we don't track** (e.g. 1theK-only MVs):
discovery can only see registered channels. If a group's MVs appear on an
unregistered channel, add that channel with `kind: label`.

## Code invariants (the sharp edges)

1. `scripts/lib/classify.mjs` (offline) and `collector/src/classify.ts`
   (worker) implement the SAME rules. Any classification change must be
   made in both and covered by both test suites: `npm test` (root) and
   `cd collector && npm test`.
2. Worker free plan allows 50 subrequests per invocation. Discovery shard
   size (currently ~12 channels) + collection batches must stay under it.
   Adding many channels → check shard math in `collector/src/scheduler.ts`.
3. Registry YAML uses `clean-videos` for escaping — never hand-edit video
   titles with quotes without running `npm run validate`.
4. D1 is a cache; R2 is the source of truth. Rebuilding D1 from scratch is
   always safe (`schema.sql` + `sync-channels-sql` + `sync-sql`).

## Quarterly

- Re-verify registry facts (agencies change, contracts expire, groups
  disband). The original verification snapshot is dated 2026-07-10.
- Review watchlist candidates: pre-debut groups, boundary cases
  (Japan-based, US-based, co-ed), semi-active groups.
- Rotate the YouTube API key if it has leaked into any log or commit.

## Failure modes

| Symptom | Check | Fix |
|---|---|---|
| No new R2 objects | `job_runs` recent rows exist? | worker exception → `wrangler tail`; redeploy |
| `error` in job_runs = quota | daily units sum | wait for 07:00 UTC reset; reduce discovery cadence |
| attempted ≠ ok for one video | video page still up? | deleted → deactivate in registry |
| Discovery finds nothing for days | `/discovered`, shard logs | uploads playlist ID changed → re-run verify-channels |
| Manifest workflow red (GitHub) | Actions log | usually transient; re-run job |
