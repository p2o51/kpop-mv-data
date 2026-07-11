# Snapshot cadence

Dynamic scheduling keeps quota for new releases without wasting units on old MVs.

| Stage | Age since publish | Default cadence |
| --- | ---: | ---: |
| Launch | 0–72 hours | every 10 minutes |
| Early | day 4–14 | hourly |
| Mid | day 15–90 | every 6 hours |
| Archive | 90+ days | daily |

Cadence is about **public view/like snapshots only**. It does not imply promotion detection.

## Quota sketch (YouTube Data API default 10,000 units/day)

- `videos.list` = 1 unit / request, up to 50 IDs
- `playlistItems.list` = 1 unit / request (new-upload checks)

Example mix still well under quota:

- 50 launch MVs × 144 runs/day ÷ 50 IDs ≈ 144 units
- 300 early MVs × 24 ÷ 50 ≈ 144 units
- 1,000 mid MVs × 4 ÷ 50 ≈ 80 units
- 5,000 archive MVs × 1 ÷ 50 ≈ 100 units
- ~20 channel upload checks ≈ 20 units

Total ≈ a few hundred units/day for a girl-group-first catalog.

## Storage policy

- D1: latest row per video + **30-day rolling window** (`video_snapshots` older
  than 30 days are purged by the daily archive tick) + job state
- Object storage (R2): immutable hourly/daily JSONL snapshots (permanent record)
- GitHub: registry, code, methodology, daily manifests/checksums
- GitHub Releases: packed daily/monthly archives (not every 10-minute commit)

## Automation

- **Collection**: Cloudflare cron every 10 minutes; tiers as above.
- **In-worker discovery**: each 10-minute tick also polls the first uploads
  page of 1/6 of the channels (every channel checked hourly, ~2 quota units
  per channel-hour). Brand-new uploads from the last 7 days are classified
  with the same rules as the offline pipeline and inserted into D1
  (`discovered_by = 'worker-auto'`) so launch-tier snapshots start within the
  hour. Review them at `/discovered`; the next offline
  `discover → clean → sync` run adopts them into `registry/videos.yaml`
  (sync only mass-deactivates registry-managed rows, never worker-auto ones).
- **Daily manifests**: the worker records each R2 object's record count and
  sha256 in D1 at write time; `/manifest?date=YYYY-MM-DD` serves the day's
  ledger, and a GitHub Action (`daily-manifest.yml`, 00:25 UTC) commits it to
  `manifests/` — no cloud credentials needed in CI.

## Discovery policy

- `npm run discover` pages each channel's full uploads playlist back to the
  age cutoff (default 730 days) — not just the latest page, so busy label
  channels (HYBE LABELS pushes a 2-month-old comeback past item 50 within
  weeks) don't hide older MVs.
- Shorts and clips are excluded by actual duration (`contentDetails`), not by
  guessing from titles; minimum runtime for an MV row is 100 s.
- Auto-`active` classes: `main_mv` and `special_video` (labels release fan
  songs / b-sides / JP singles as dedicated "Special Video/Clip/Film" MVs).
  Everything else (`performance_video`, `japanese_version`, `visualizer`,
  `lyric_video`, `cover_video`, …) is kept in the registry but inactive until
  reviewed.
- Artist attribution requires the act's name to match **before the first
  quote character** in the title — in K-pop title grammar ("ARTIST 'SONG' MV")
  a name inside the quotes is a song title, not the artist (NCT WISH's song
  "Dreamcatcher", MIYEON's song "Say My Name").
