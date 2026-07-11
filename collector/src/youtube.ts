import type { Snapshot } from "./types";

type YoutubeVideosListResponse = {
  items?: Array<{
    id: string;
    snippet?: { channelId?: string };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
  }>;
  error?: { code: number; message: string };
};

function parseCount(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function fetchVideoStats(
  apiKey: string,
  videoIds: string[],
  collectorVersion: string,
  snapshotAt = new Date().toISOString(),
): Promise<{ snapshots: Snapshot[]; quotaUnits: number }> {
  if (videoIds.length === 0) return { snapshots: [], quotaUnits: 0 };
  if (videoIds.length > 50) {
    throw new Error("videos.list accepts at most 50 ids per request");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics,snippet");
  url.searchParams.set("id", videoIds.join(","));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const body = (await res.json()) as YoutubeVideosListResponse;

  if (!res.ok || body.error) {
    throw new Error(
      `YouTube videos.list failed: ${body.error?.message ?? res.statusText}`,
    );
  }

  const snapshots: Snapshot[] = (body.items ?? []).map((item) => {
    const viewCount = parseCount(item.statistics?.viewCount);
    if (viewCount === null) {
      throw new Error(`Missing viewCount for ${item.id}`);
    }
    return {
      video_id: item.id,
      channel_id: item.snippet?.channelId,
      snapshot_at: snapshotAt,
      view_count: viewCount,
      like_count: parseCount(item.statistics?.likeCount),
      comment_count: parseCount(item.statistics?.commentCount),
      data_source: "youtube_data_api_v3",
      collector_version: collectorVersion,
    };
  });

  return { snapshots, quotaUnits: 1 };
}

export async function listRecentUploads(
  apiKey: string,
  uploadsPlaylistId: string,
  maxResults = 10,
): Promise<{ videoIds: string[]; quotaUnits: number }> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("playlistId", uploadsPlaylistId);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url);
  const body = (await res.json()) as {
    items?: Array<{ contentDetails?: { videoId?: string } }>;
    error?: { message: string };
  };

  if (!res.ok || body.error) {
    throw new Error(
      `YouTube playlistItems.list failed: ${body.error?.message ?? res.statusText}`,
    );
  }

  const videoIds = (body.items ?? [])
    .map((i) => i.contentDetails?.videoId)
    .filter((id): id is string => Boolean(id));

  return { videoIds, quotaUnits: 1 };
}
