#!/usr/bin/env node
/**
 * Discover MVs by paging each channel's FULL uploads playlist back to a cutoff
 * date (not just the latest page — a busy label channel pushes a 2-month-old
 * comeback past item 50 within weeks).
 *
 * Shorts and clips are excluded by actual duration (contentDetails), not by
 * guessing from titles.
 *
 * Usage:
 *   node scripts/discover-videos.mjs [--max-age-days 730] [--max-pages 40] [--fresh]
 */
import {
  buildGroupMatcher,
  durationSeconds,
  loadApiKey,
  loadRegistry,
  saveVideos,
  ytGet,
} from "./lib/registry.mjs";
import {
  ACTIVE_CLASSES,
  MIN_MV_SECONDS,
  MV_RE,
  NON_MUSIC_RE,
  REJECT_RE,
  classify,
  stripFeat,
} from "./lib/classify.mjs";

// Classes worth keeping in the registry even when inactive; plain "other" /
// "short_form" noise is dropped so videos.yaml stays reviewable.
const KEEP_CLASSES = new Set([
  "main_mv",
  "special_video",
  "cover_video",
  "japanese_version",
  "dance_practice",
  "performance_video",
  "visualizer",
  "audio_only",
  "lyric_video",
]);

const args = process.argv.slice(2);
const maxAgeDays = Number(argValue("--max-age-days") ?? 730);
const maxPages = Number(argValue("--max-pages") ?? 40);
const fresh = args.includes("--fresh");

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const apiKey = loadApiKey();
const { groups, channels, videos: existing } = loadRegistry();
const matchGroup = buildGroupMatcher(groups);
const byId = new Map(
  fresh ? [] : existing.map((v) => [v.youtube_video_id, v]),
);

const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
// Uploads playlists are only roughly reverse-chronological; keep paging until
// a whole page is 60 days past the cutoff before trusting we are done.
const pageStop = cutoff - 60 * 24 * 60 * 60 * 1000;
let quota = 0;

for (const ch of channels) {
  if (ch.kind === "distributor") continue;
  const playlistId = ch.uploads_playlist_id;
  if (!playlistId) continue;

  const ids = [];
  let pageToken;
  let pages = 0;
  try {
    while (pages < maxPages) {
      const list = await ytGet(apiKey, "playlistItems", {
        part: "contentDetails",
        playlistId,
        maxResults: 50,
        ...(pageToken ? { pageToken } : {}),
      });
      quota += 1;
      pages += 1;
      let pageOldest = Infinity;
      for (const item of list.items ?? []) {
        const id = item.contentDetails?.videoId;
        const published = item.contentDetails?.videoPublishedAt;
        if (!id || !published) continue;
        const ts = Date.parse(published);
        pageOldest = Math.min(pageOldest, ts);
        if (ts >= cutoff) ids.push(id);
      }
      pageToken = list.nextPageToken;
      if (!pageToken) break;
      if (pageOldest !== Infinity && pageOldest < pageStop) break;
    }
  } catch (err) {
    process.stderr.write(`✗ ${ch.id}: ${err.message}\n`);
    continue;
  }

  let activeCount = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    let vids;
    try {
      vids = await ytGet(apiKey, "videos", {
        part: "snippet,contentDetails",
        id: batch.join(","),
      });
      quota += 1;
    } catch (err) {
      process.stderr.write(`✗ ${ch.id} videos.list: ${err.message}\n`);
      continue;
    }
    for (const item of vids.items ?? []) {
      const title = item.snippet?.title ?? "";
      const published_at = item.snippet?.publishedAt ?? null;
      const seconds = durationSeconds(item.contentDetails?.duration);

      // Match on the feat-stripped title so featured girl-group members
      // don't claim someone else's MV.
      let group = matchGroup(stripFeat(title));
      if (
        !group &&
        ch.kind === "artist" &&
        (ch.track_groups ?? []).length === 1 &&
        MV_RE.test(title) &&
        !REJECT_RE.test(title)
      ) {
        group = ch.track_groups[0];
      }

      let video_class = classify(title);
      if (seconds != null && seconds < MIN_MV_SECONDS) video_class = "short_form";

      const active =
        ACTIVE_CLASSES.has(video_class) &&
        Boolean(group) &&
        !NON_MUSIC_RE.test(title) &&
        seconds != null &&
        seconds >= MIN_MV_SECONDS;

      const row = {
        youtube_video_id: item.id,
        group: group ?? "unknown",
        channel: ch.id,
        title,
        published_at,
        duration_seconds: seconds,
        video_class,
        active,
        notes: active ? "auto: main_mv" : "auto: inactive",
      };
      if (active) activeCount += 1;

      const prev = byId.get(item.id);
      // Manual rows (notes starting with "manual") always win.
      if (prev && String(prev.notes ?? "").startsWith("manual")) {
        byId.set(item.id, { ...row, ...prev });
      } else {
        byId.set(item.id, row);
      }
    }
  }
  process.stderr.write(
    `✓ ${ch.id}: ${pages} pages, ${ids.length} in window, active_main ${activeCount}\n`,
  );
}

const kept = [...byId.values()].filter(
  (v) =>
    v.active ||
    String(v.notes ?? "").startsWith("manual") ||
    (v.group !== "unknown" && KEEP_CLASSES.has(v.video_class)),
);
const merged = kept.sort((a, b) =>
  String(b.published_at).localeCompare(String(a.published_at)),
);

saveVideos(
  merged,
  `# Tracked videos.
# active=true => collector snapshots this row (girl-group / female-solo main MV).
# Rows with notes starting "manual" are preserved across discovery runs.

`,
);

const active = merged.filter((v) => v.active);
console.log(
  JSON.stringify(
    {
      channels_scanned: channels.length,
      videos_total: merged.length,
      active_main_mv: active.length,
      quota_units_used: quota,
      out: "registry/videos.yaml",
    },
    null,
    2,
  ),
);
