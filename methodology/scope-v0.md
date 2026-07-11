# Scope v0

Girl-group-first K-pop MV **public stats** infrastructure.

## In scope

- ~20 seed channels (Big 4 + major mid-tier + distributors)
- ~40 girl groups / female soloists in registry
- Manual + collector-assisted MV registration
- Hourly/daily public `viewCount` / `likeCount` snapshots
- Open registry PRs for channels, groups, and video classification
- Static site that shows facts only

## Out of scope (public)

- Non-organic / paid-view estimates
- Charts-unrecognized rankings
- Company “promotion intensity” leaderboards

## Next increments

1. Wire YouTube API key + deploy Cloudflare Worker cron
2. Discover recent uploads from seed channels into `registry/videos.yaml`
3. Classify `main_mv` vs performance / dance practice
4. Daily R2 export + GitHub Release manifest
5. Private analysis repo (separate) that only reads public snapshots
