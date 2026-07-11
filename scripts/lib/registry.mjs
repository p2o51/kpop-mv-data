/**
 * Shared registry IO for scripts. js-yaml everywhere — no hand-rolled parsing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadYamlList(name) {
  const text = readFileSync(join(root, "registry", name), "utf8");
  const data = yaml.load(text);
  return Array.isArray(data) ? data : [];
}

export function loadRegistry() {
  return {
    companies: loadYamlList("companies.yaml"),
    groups: loadYamlList("groups.yaml"),
    channels: loadYamlList("channels.yaml"),
    videos: loadYamlList("videos.yaml"),
  };
}

export function saveVideos(videos, header) {
  const body = yaml.dump(videos, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  });
  writeFileSync(join(root, "registry", "videos.yaml"), (header ?? "") + body);
}

export function loadApiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  const text = readFileSync(join(root, "collector", ".dev.vars"), "utf8");
  const m = text.match(/^YOUTUBE_API_KEY=(.+)$/m);
  if (!m) throw new Error("YOUTUBE_API_KEY missing in collector/.dev.vars");
  return m[1].trim();
}

export async function ytGet(apiKey, path, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok || body.error) {
    throw new Error(body.error?.message ?? res.statusText);
  }
  return body;
}

/** ISO-8601 duration (PT#H#M#S) → seconds. */
export function durationSeconds(iso) {
  const m = String(iso ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

/**
 * Word-boundary-safe act-name matching.
 * Latin names get boundaries (IVE must not match "Anniversary");
 * Korean names use plain inclusion (no word boundaries in Hangul).
 */
export function nameMatches(title, name) {
  return nameMatchIndex(title, name) >= 0;
}

/** Index where the act name matches in the title, or -1. */
export function nameMatchIndex(title, name) {
  if (!name) return -1;
  if (/^[\x00-\x7F]+$/.test(name)) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`(?:^|[^A-Za-z0-9])(${esc})(?=[^A-Za-z0-9]|$)`, "i").exec(title);
    return m ? m.index + m[0].indexOf(m[1]) : -1;
  }
  return title.indexOf(name);
}

/** All match names for a group row: name + name_ko + aliases[]. */
export function groupNames(group) {
  return [group.name, group.name_ko, ...(group.aliases ?? [])].filter(Boolean);
}

const QUOTE_RE = /['"‘’“”「『]/;

export function buildGroupMatcher(groups) {
  const patterns = [];
  for (const g of groups) {
    if (g.gender && g.gender !== "female") continue;
    for (const name of groupNames(g)) patterns.push({ group: g.id, name });
  }
  // Longest first so "LE SSERAFIM" wins over hypothetical shorter overlaps.
  patterns.sort((a, b) => b.name.length - a.name.length);
  return (title) => {
    // K-pop MV titles put the artist BEFORE the quoted song title
    // ("ARTIST 'SONG' MV"). A name that only appears inside the quotes is a
    // song title, not the artist (j-hope 'MONA LISA', NCT WISH 'Dreamcatcher',
    // MIYEON 'Say My Name') — a match must START before the first quote char.
    // (Start-based, not slice-based, so Girls' Generation's apostrophe
    // doesn't truncate the artist segment.)
    const q = title.search(QUOTE_RE);
    for (const p of patterns) {
      const i = nameMatchIndex(title, p.name);
      if (i >= 0 && (q < 0 || i < q)) return p.group;
    }
    return null;
  };
}
