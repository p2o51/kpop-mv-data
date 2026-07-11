#!/usr/bin/env node
/**
 * Verify every registry channel ID against the YouTube API.
 * Fails when an ID does not exist or the actual channel title looks unrelated
 * to the registry title (guards against pasted-wrong IDs).
 *
 * Usage: node scripts/verify-channels.mjs
 */
import { loadApiKey, loadRegistry, ytGet } from "./lib/registry.mjs";

const apiKey = loadApiKey();
const { channels } = loadRegistry();

let failed = 0;
for (let i = 0; i < channels.length; i += 50) {
  const batch = channels.slice(i, i + 50);
  const res = await ytGet(apiKey, "channels", {
    part: "snippet,statistics",
    id: batch.map((c) => c.youtube_channel_id).join(","),
    maxResults: 50,
  });
  const byId = new Map((res.items ?? []).map((it) => [it.id, it]));
  for (const ch of batch) {
    const item = byId.get(ch.youtube_channel_id);
    if (!item) {
      console.error(`✗ ${ch.id}: channel ${ch.youtube_channel_id} not found`);
      failed += 1;
      continue;
    }
    const actual = item.snippet?.title ?? "";
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
    const related =
      norm(actual).includes(norm(ch.title).slice(0, 6)) ||
      norm(ch.title).includes(norm(actual).slice(0, 6));
    const subs = item.statistics?.subscriberCount;
    if (!related) {
      console.error(`? ${ch.id}: registry says "${ch.title}" but API says "${actual}" — check`);
      failed += 1;
    } else {
      console.log(`✓ ${ch.id}: "${actual}" (${subs} subs)`);
    }
  }
}

if (failed) {
  console.error(`\n${failed} channel(s) failed verification`);
  process.exit(1);
}
console.log("\nAll channels verified");
