import type { Env, Snapshot } from "./types";

export async function persistSnapshots(env: Env, snapshots: Snapshot[]): Promise<void> {
  if (snapshots.length === 0) return;

  const statements: D1PreparedStatement[] = [];

  for (const s of snapshots) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO video_latest
          (video_id, channel_id, view_count, like_count, comment_count, snapshot_at, collector_version, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(video_id) DO UPDATE SET
           channel_id = excluded.channel_id,
           view_count = excluded.view_count,
           like_count = excluded.like_count,
           comment_count = excluded.comment_count,
           snapshot_at = excluded.snapshot_at,
           collector_version = excluded.collector_version,
           updated_at = excluded.updated_at`,
      ).bind(
        s.video_id,
        s.channel_id ?? null,
        s.view_count,
        s.like_count,
        s.comment_count,
        s.snapshot_at,
        s.collector_version,
        s.snapshot_at,
      ),
    );

    statements.push(
      env.DB.prepare(
        `INSERT INTO video_snapshots
          (video_id, channel_id, view_count, like_count, comment_count, snapshot_at, collector_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        s.video_id,
        s.channel_id ?? null,
        s.view_count,
        s.like_count,
        s.comment_count,
        s.snapshot_at,
        s.collector_version,
      ),
    );
  }

  await env.DB.batch(statements);
}

export async function writeHourlyObject(
  env: Env,
  snapshots: Snapshot[],
  at: Date,
): Promise<string | null> {
  if (snapshots.length === 0) return null;

  const yyyy = at.getUTCFullYear();
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(at.getUTCDate()).padStart(2, "0");
  const hh = String(at.getUTCHours()).padStart(2, "0");
  const key = `snapshots/${yyyy}/${mm}/${dd}/${hh}.jsonl`;

  const body = snapshots.map((s) => JSON.stringify(s)).join("\n") + "\n";

  // Append-friendly: if object exists, concatenate (small hourly batches).
  const existing = await env.SNAPSHOTS.get(key);
  const next = existing ? `${await existing.text()}${body}` : body;

  await env.SNAPSHOTS.put(key, next, {
    httpMetadata: { contentType: "application/x-ndjson" },
    customMetadata: {
      collector_version: env.COLLECTOR_VERSION,
      records: String(snapshots.length),
    },
  });

  // Ledger for /manifest: record count + sha256 of the full object, computed
  // at write time so manifests never need to re-read R2.
  const records = next.split("\n").filter(Boolean).length;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(next),
  );
  const sha256 = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  await env.DB.prepare(
    `INSERT INTO r2_objects (object_key, records, sha256, collector_version, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(object_key) DO UPDATE SET
       records = excluded.records,
       sha256 = excluded.sha256,
       collector_version = excluded.collector_version,
       updated_at = excluded.updated_at`,
  )
    .bind(key, records, sha256, env.COLLECTOR_VERSION, at.toISOString())
    .run();

  return key;
}
