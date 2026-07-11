#!/usr/bin/env node
/**
 * Registry consistency checks — catches broken PRs early.
 */
import { loadRegistry } from "./lib/registry.mjs";

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

const { companies, groups, channels, videos } = loadRegistry();

const companyIds = new Set(companies.map((c) => c.id));
const groupIds = new Set(groups.map((g) => g.id));
const channelIds = new Set(channels.map((c) => c.id));

if (companies.length === 0) fail("companies.yaml is empty");
else ok(`${companies.length} companies`);

if (groups.length === 0) fail("groups.yaml is empty");
else ok(`${groups.length} groups`);

if (channels.length === 0) fail("channels.yaml is empty");
else ok(`${channels.length} channels`);

for (const c of companies) {
  if (!c.id) fail("company missing id");
  if (c.parent && !companyIds.has(c.parent)) {
    fail(`company ${c.id} parent missing: ${c.parent}`);
  }
}

for (const g of groups) {
  if (!g.id || !g.name) fail(`group incomplete: ${JSON.stringify(g)}`);
  if (g.company && !companyIds.has(g.company)) {
    fail(`group ${g.id} references unknown company: ${g.company}`);
  }
  if (g.status && !["active", "hiatus", "inactive", "disbanded"].includes(g.status)) {
    fail(`group ${g.id} bad status: ${g.status}`);
  }
}

const ytChannelIds = new Set();
for (const ch of channels) {
  if (!ch.id || !ch.youtube_channel_id) {
    fail(`channel incomplete: ${JSON.stringify(ch)}`);
    continue;
  }
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(ch.youtube_channel_id)) {
    fail(`bad youtube_channel_id for ${ch.id}: ${ch.youtube_channel_id}`);
  }
  if (ch.uploads_playlist_id && ch.uploads_playlist_id !== "UU" + ch.youtube_channel_id.slice(2)) {
    fail(`channel ${ch.id} uploads_playlist_id does not match channel id`);
  }
  if (ytChannelIds.has(ch.youtube_channel_id)) {
    fail(`duplicate youtube_channel_id: ${ch.youtube_channel_id}`);
  }
  ytChannelIds.add(ch.youtube_channel_id);

  if (ch.company && !companyIds.has(ch.company)) {
    fail(`channel ${ch.id} unknown company: ${ch.company}`);
  }
  for (const gid of ch.track_groups ?? []) {
    if (!groupIds.has(gid)) {
      fail(`channel ${ch.id} unknown track_group: ${gid}`);
    }
  }
}

if (videos.length > 0) {
  ok(`${videos.length} videos`);
  const seen = new Set();
  for (const v of videos) {
    if (!v.youtube_video_id || !/^[A-Za-z0-9_-]{11}$/.test(v.youtube_video_id)) {
      fail(`bad youtube_video_id: ${v.youtube_video_id}`);
    }
    if (seen.has(v.youtube_video_id)) fail(`duplicate video: ${v.youtube_video_id}`);
    seen.add(v.youtube_video_id);
    if (v.group && v.group !== "unknown" && !groupIds.has(v.group)) {
      fail(`video ${v.youtube_video_id} unknown group: ${v.group}`);
    }
    if (v.channel && !channelIds.has(v.channel)) {
      fail(`video ${v.youtube_video_id} unknown channel: ${v.channel}`);
    }
  }
} else {
  ok("videos.yaml empty (ok for bootstrap)");
}

if (!process.exitCode) {
  console.log("\nRegistry OK");
} else {
  console.error("\nRegistry validation failed");
  process.exit(1);
}
