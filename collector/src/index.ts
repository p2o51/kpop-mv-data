import { runDiscovery } from "./discovery";
import { chunk, selectDueVideos, tiersDueAt } from "./scheduler";
import { persistSnapshots, writeHourlyObject } from "./store";
import type { Env, TrackedVideo } from "./types";
import { COLLECTOR_VERSION_FALLBACK } from "./types";
import { fetchVideoStats } from "./youtube";

function unauthorized(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

function authorizeRun(request: Request, env: Env): boolean {
  const expected = env.COLLECTOR_RUN_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const query = new URL(request.url).searchParams.get("token");
  const provided = bearer || query || request.headers.get("x-run-token");
  return Boolean(provided && provided === expected);
}

export default {
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const at = new Date(controller.scheduledTime);
    ctx.waitUntil(
      (async () => {
        await runCollection(env, at);
        // One shard of channels per tick → every channel checked hourly,
        // and each invocation stays far below the subrequest cap.
        await runDiscovery(env, at);
      })(),
    );
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        collector_version: env.COLLECTOR_VERSION ?? COLLECTOR_VERSION_FALLBACK,
        public_surface: "facts_only",
      });
    }

    if (url.pathname === "/run" && request.method === "POST") {
      if (!authorizeRun(request, env)) return unauthorized();
      const discover = url.searchParams.get("discover");
      if (discover != null) {
        const shard = discover === "all" ? ("all" as const) : Number(discover);
        const result = await runDiscovery(env, new Date(), { shard });
        return Response.json(result);
      }
      const forceAll = url.searchParams.get("force") === "all";
      const result = await runCollection(env, new Date(), { forceAll });
      return Response.json(result);
    }

    if (url.pathname === "/discovered") {
      const { results } = await env.DB.prepare(
        `SELECT video_id, channel_id, group_id, video_class, published_at,
                active, title, duration_seconds, discovered_at
         FROM tracked_videos
         WHERE discovered_by = 'worker-auto'
         ORDER BY discovered_at DESC
         LIMIT 200`,
      ).all();
      return Response.json({
        note: "auto-discovered by the worker; adopt into registry/videos.yaml via the offline discover + sync",
        items: results,
      });
    }

    if (url.pathname === "/manifest") {
      const date = url.searchParams.get("date") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return Response.json(
          { ok: false, error: "use /manifest?date=YYYY-MM-DD" },
          { status: 400 },
        );
      }
      const prefix = `snapshots/${date.replaceAll("-", "/")}/`;
      const { results } = await env.DB.prepare(
        `SELECT object_key, records, sha256, collector_version, updated_at
         FROM r2_objects
         WHERE object_key LIKE ?
         ORDER BY object_key`,
      )
        .bind(prefix + "%")
        .all();
      const objects = results ?? [];
      return Response.json({
        date,
        data_source: "youtube_data_api_v3",
        object_count: objects.length,
        record_total: objects.reduce(
          (n, o) => n + Number((o as { records: number }).records ?? 0),
          0,
        ),
        objects,
        generated_at: new Date().toISOString(),
      });
    }

    if (url.pathname === "/latest") {
      const { results } = await env.DB.prepare(
        `SELECT l.video_id, l.channel_id, l.view_count, l.like_count, l.comment_count,
                l.snapshot_at, l.collector_version, t.group_id, t.video_class
         FROM video_latest l
         INNER JOIN tracked_videos t ON t.video_id = l.video_id
         WHERE t.active = 1
         ORDER BY l.view_count DESC
         LIMIT 100`,
      ).all();
      return Response.json({ data_source: "youtube_data_api_v3", items: results });
    }

    return new Response(
      "kpop-mv-collector — public facts only. See /health, /latest, /discovered, /manifest?date=YYYY-MM-DD",
      { status: 200 },
    );
  },
} satisfies ExportedHandler<Env>;

/** D1 keeps a rolling window only; the immutable history lives in R2. */
const SNAPSHOT_RETENTION_DAYS = 30;

async function purgeOldSnapshots(env: Env, at: Date): Promise<number> {
  const cutoff = new Date(
    at.getTime() - SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const result = await env.DB.prepare(
    `DELETE FROM video_snapshots WHERE snapshot_at < ?`,
  )
    .bind(cutoff)
    .run();
  return result.meta.changes ?? 0;
}

async function runCollection(
  env: Env,
  at: Date,
  opts: { forceAll?: boolean } = {},
) {
  const startedAt = at.toISOString();
  const version = env.COLLECTOR_VERSION ?? COLLECTOR_VERSION_FALLBACK;

  if (!env.YOUTUBE_API_KEY) {
    await env.DB.prepare(
      `INSERT INTO job_runs (started_at, finished_at, error) VALUES (?, ?, ?)`,
    )
      .bind(startedAt, new Date().toISOString(), "missing YOUTUBE_API_KEY")
      .run();
    return { ok: false, error: "missing YOUTUBE_API_KEY" };
  }

  const dueTiers = opts.forceAll
    ? new Set(["launch", "early", "mid", "archive"] as const)
    : tiersDueAt(at);
  const { results: rows } = await env.DB.prepare(
    `SELECT video_id, channel_id, published_at, priority_boost
     FROM tracked_videos
     WHERE active = 1`,
  ).all<TrackedVideo>();

  const due = opts.forceAll
    ? (rows ?? [])
    : selectDueVideos(rows ?? [], dueTiers, at.getTime());
  let quotaUnits = 0;
  let videosOk = 0;
  const allSnapshots = [];

  try {
    for (const batch of chunk(due, 50)) {
      const ids = batch.map((v) => v.video_id);
      const { snapshots, quotaUnits: used } = await fetchVideoStats(
        env.YOUTUBE_API_KEY,
        ids,
        version,
        at.toISOString(),
      );
      quotaUnits += used;
      videosOk += snapshots.length;
      allSnapshots.push(...snapshots);
      await persistSnapshots(env, snapshots);
    }

    const objectKey = await writeHourlyObject(env, allSnapshots, at);

    // Once a day (archive tick at 00:00 UTC) trim D1 to the rolling window.
    let purged = 0;
    if (dueTiers.has("archive")) {
      purged = await purgeOldSnapshots(env, at);
    }

    await env.DB.prepare(
      `INSERT INTO job_runs
        (started_at, finished_at, tier, videos_attempted, videos_ok, quota_units)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        startedAt,
        new Date().toISOString(),
        [...dueTiers].join(","),
        due.length,
        videosOk,
        quotaUnits,
      )
      .run();

    return {
      ok: true,
      tiers: [...dueTiers],
      attempted: due.length,
      ok_count: videosOk,
      quota_units: quotaUnits,
      object_key: objectKey,
      snapshots_purged: purged,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(
      `INSERT INTO job_runs
        (started_at, finished_at, tier, videos_attempted, videos_ok, quota_units, error)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        startedAt,
        new Date().toISOString(),
        [...dueTiers].join(","),
        due.length,
        videosOk,
        quotaUnits,
        message,
      )
      .run();
    return { ok: false, error: message, quota_units: quotaUnits };
  }
}
