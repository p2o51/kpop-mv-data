import {
  ACTIVE_CLASSES,
  KEEP_CLASSES,
  MIN_MV_SECONDS,
  MV_RE,
  NON_MUSIC_RE,
  REJECT_RE,
  buildGroupMatcher,
  classify,
  durationSeconds,
  stripFeat,
} from "./classify";
import type { ActGroup } from "./classify";
import type { Env } from "./types";

/**
 * In-worker discovery: poll the first uploads page of a SHARD of channels and
 * insert brand-new MVs into tracked_videos so launch-tier collection starts
 * within the hour — no manual registry sync needed for the hot window.
 *
 * Sharding keeps each invocation far below the free-plan subrequest cap:
 * with 6 shards on a 10-minute cron, every channel is still checked hourly.
 */
export const DISCOVERY_SHARDS = 6;

/** Only look at uploads from the last N days — older ones are the offline
 * discover script's job. */
const FRESH_WINDOW_DAYS = 7;

type ChannelRow = {
  channel_id: string;
  registry_id: string;
  uploads_playlist_id: string | null;
  kind: string;
  track_groups: string;
};

export function shardAt(at: Date): number {
  return Math.floor(at.getUTCMinutes() / 10) % DISCOVERY_SHARDS;
}

async function ytGet(apiKey: string, path: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", apiKey);
  const res = await fetch(url.toString());
  const body = (await res.json()) as any;
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? res.statusText);
  }
  return body;
}

export async function runDiscovery(
  env: Env,
  at: Date,
  opts: { shard?: number | "all" } = {},
) {
  const startedAt = at.toISOString();
  const shard = opts.shard ?? shardAt(at);

  const { results: allChannels } = await env.DB.prepare(
    `SELECT channel_id, registry_id, uploads_playlist_id, kind, track_groups
     FROM tracked_channels
     WHERE active = 1 AND kind != 'distributor'
     ORDER BY channel_id`,
  ).all<ChannelRow>();

  const channels = (allChannels ?? []).filter(
    (_, i) => shard === "all" || i % DISCOVERY_SHARDS === shard,
  );

  const { results: groupRows } = await env.DB.prepare(
    `SELECT group_id, name, name_ko, aliases FROM act_groups`,
  ).all<ActGroup>();
  const matchGroup = buildGroupMatcher(groupRows ?? []);

  const freshCutoff = at.getTime() - FRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let quotaUnits = 0;
  let inserted = 0;
  const insertedRows: { video_id: string; group_id: string | null; title: string; active: boolean }[] = [];
  const errors: string[] = [];

  for (const ch of channels) {
    if (!ch.uploads_playlist_id) continue;
    let list;
    try {
      list = await ytGet(env.YOUTUBE_API_KEY, "playlistItems", {
        part: "contentDetails",
        playlistId: ch.uploads_playlist_id,
        maxResults: "10",
      });
      quotaUnits += 1;
    } catch (err) {
      errors.push(`${ch.registry_id}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const freshIds: string[] = [];
    for (const item of list.items ?? []) {
      const id = item.contentDetails?.videoId;
      const published = item.contentDetails?.videoPublishedAt;
      if (!id || !published) continue;
      if (Date.parse(published) >= freshCutoff) freshIds.push(id);
    }
    if (freshIds.length === 0) continue;

    const placeholders = freshIds.map(() => "?").join(",");
    const { results: known } = await env.DB.prepare(
      `SELECT video_id FROM tracked_videos WHERE video_id IN (${placeholders})`,
    )
      .bind(...freshIds)
      .all<{ video_id: string }>();
    const knownIds = new Set((known ?? []).map((r) => r.video_id));
    const newIds = freshIds.filter((id) => !knownIds.has(id));
    if (newIds.length === 0) continue;

    let vids;
    try {
      vids = await ytGet(env.YOUTUBE_API_KEY, "videos", {
        part: "snippet,contentDetails",
        id: newIds.join(","),
      });
      quotaUnits += 1;
    } catch (err) {
      errors.push(`${ch.registry_id} videos.list: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    const trackGroups: string[] = JSON.parse(ch.track_groups || "[]");
    const statements: D1PreparedStatement[] = [];
    for (const item of vids.items ?? []) {
      const title: string = item.snippet?.title ?? "";
      const publishedAt: string | null = item.snippet?.publishedAt ?? null;
      const seconds = durationSeconds(item.contentDetails?.duration);

      let group = matchGroup(stripFeat(title));
      if (
        !group &&
        ch.kind === "artist" &&
        trackGroups.length === 1 &&
        MV_RE.test(title) &&
        !REJECT_RE.test(title)
      ) {
        group = trackGroups[0];
      }

      let videoClass = classify(title);
      if (seconds != null && seconds < MIN_MV_SECONDS) videoClass = "short_form";

      const active =
        ACTIVE_CLASSES.has(videoClass) &&
        Boolean(group) &&
        !NON_MUSIC_RE.test(title) &&
        seconds != null &&
        seconds >= MIN_MV_SECONDS;

      // Same keep policy as the offline discover script: skip pure noise.
      if (!active && !(group && KEEP_CLASSES.has(videoClass))) continue;

      statements.push(
        env.DB.prepare(
          `INSERT INTO tracked_videos
            (video_id, channel_id, group_id, video_class, published_at, active,
             priority_boost, title, duration_seconds, discovered_by, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 'worker-auto', ?)
           ON CONFLICT(video_id) DO NOTHING`,
        ).bind(
          item.id,
          ch.channel_id,
          group,
          videoClass,
          publishedAt,
          active ? 1 : 0,
          title,
          seconds,
          startedAt,
        ),
      );
      insertedRows.push({ video_id: item.id, group_id: group, title, active });
    }
    if (statements.length > 0) {
      await env.DB.batch(statements);
      inserted += statements.length;
    }
  }

  await env.DB.prepare(
    `INSERT INTO job_runs (started_at, finished_at, tier, videos_attempted, videos_ok, quota_units, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      startedAt,
      new Date().toISOString(),
      `discovery:${shard}`,
      channels.length,
      inserted,
      quotaUnits,
      errors.length ? errors.join("; ") : null,
    )
    .run();

  return {
    ok: errors.length === 0,
    shard,
    channels_checked: channels.length,
    new_rows: inserted,
    new_active: insertedRows.filter((r) => r.active).length,
    quota_units: quotaUnits,
    rows: insertedRows,
    errors,
  };
}
