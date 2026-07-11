import type { CadenceTier, TrackedVideo } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Age-based snapshot cadence from methodology/collection.md */
export function cadenceFor(publishedAt: string | null, now = Date.now()): {
  tier: CadenceTier;
  intervalMs: number;
} {
  if (!publishedAt) {
    return { tier: "archive", intervalMs: 24 * HOUR };
  }
  const ageMs = now - Date.parse(publishedAt);
  if (Number.isNaN(ageMs) || ageMs < 0) {
    return { tier: "archive", intervalMs: 24 * HOUR };
  }
  if (ageMs <= 72 * HOUR) return { tier: "launch", intervalMs: 10 * MINUTE };
  if (ageMs <= 14 * 24 * HOUR) return { tier: "early", intervalMs: HOUR };
  if (ageMs <= 90 * 24 * HOUR) return { tier: "mid", intervalMs: 6 * HOUR };
  return { tier: "archive", intervalMs: 24 * HOUR };
}

/**
 * Align cron ticks (every 10m) to each tier's interval.
 * launch: every tick
 * early: :00 of each hour
 * mid: 00:00, 06:00, 12:00, 18:00 UTC
 * archive: 00:00 UTC
 */
export function tiersDueAt(date: Date): Set<CadenceTier> {
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  const due = new Set<CadenceTier>(["launch"]);

  if (minute === 0) {
    due.add("early");
    if (hour % 6 === 0) due.add("mid");
    if (hour === 0) due.add("archive");
  }
  return due;
}

export function selectDueVideos(
  videos: TrackedVideo[],
  dueTiers: Set<CadenceTier>,
  now = Date.now(),
): TrackedVideo[] {
  return videos.filter((v) => {
    const { tier } = cadenceFor(v.published_at, now);
    return dueTiers.has(tier);
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
