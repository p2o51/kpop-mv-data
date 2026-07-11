#!/usr/bin/env node
/**
 * Reclassify registry/videos.yaml offline with the shared rules.
 * Rows whose notes start with "manual" are left untouched.
 */
import { buildGroupMatcher, loadRegistry, saveVideos } from "./lib/registry.mjs";
import { MV_RE, REJECT_RE, reclassify, stripFeat } from "./lib/classify.mjs";

const { groups, channels, videos } = loadRegistry();
const channelById = new Map(channels.map((c) => [c.id, c]));
const matchGroup = buildGroupMatcher(groups);

for (const v of videos) {
  if (String(v.notes ?? "").startsWith("manual")) continue;
  const ch = channelById.get(v.channel);
  const title = String(v.title ?? "");

  let group = matchGroup(stripFeat(title));
  if (
    !group &&
    ch?.kind === "artist" &&
    (ch.track_groups ?? []).length === 1 &&
    MV_RE.test(title) &&
    !REJECT_RE.test(title)
  ) {
    group = ch.track_groups[0];
  }

  reclassify(v, group, ch?.kind);
  v.notes = v.active ? "auto: main_mv" : "auto: inactive";
}

videos.sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
saveVideos(
  videos,
  `# Tracked videos.
# active=true => collector snapshots this row (girl-group / female-solo main MV).
# Rows with notes starting "manual" are preserved across discovery runs.

`,
);

const active = videos.filter((v) => v.active);
console.log(
  JSON.stringify(
    {
      total: videos.length,
      active: active.length,
      active_list: active.map((v) => ({
        id: v.youtube_video_id,
        group: v.group,
        published_at: String(v.published_at).slice(0, 10),
        title: v.title,
      })),
    },
    null,
    2,
  ),
);
