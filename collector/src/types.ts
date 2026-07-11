export type Env = {
  DB: D1Database;
  SNAPSHOTS: R2Bucket;
  YOUTUBE_API_KEY: string;
  COLLECTOR_VERSION: string;
  /** Shared secret for POST /run (Bearer / x-run-token / ?token=) */
  COLLECTOR_RUN_SECRET: string;
};

export type Snapshot = {
  video_id: string;
  channel_id?: string;
  snapshot_at: string;
  view_count: number;
  like_count: number | null;
  comment_count: number | null;
  data_source: "youtube_data_api_v3";
  collector_version: string;
};

export type TrackedVideo = {
  video_id: string;
  channel_id: string;
  published_at: string | null;
  priority_boost: number;
};

export type CadenceTier = "launch" | "early" | "mid" | "archive";

export const COLLECTOR_VERSION_FALLBACK = "0.1.0";
