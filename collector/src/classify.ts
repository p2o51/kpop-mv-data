/**
 * Title classification + artist attribution, ported from
 * scripts/lib/classify.mjs and scripts/lib/registry.mjs.
 * KEEP THE REGEXES IN SYNC with those files — they are the single source of
 * truth exercised by the offline pipeline and its tests.
 */

// "MV" needs boundaries: 'MVP' / 'MEOVV' must not match.
export const MV_RE =
  /(?:^|[^A-Za-z])M\/?V(?![A-Za-z])|Official\s*(Music\s*)?Video|뮤직비디오|(?:^|[^가-힣A-Za-z])뮤비(?![가-힣])|Music Video/i;

export const REJECT_RE =
  /teaser|trailer|behind|making|i-talk|interview|vlog|relay|jacket|highlight|medley|audition|fanmeeting|촬영|찍어|비하인드|티저|메이킹|remix|sped up|dance practice|안무|choreography|performance (ver|mv|video)|dance performance|live clip|live stage|special live|fan ?cam|셀프캠|self ?cam|직캠|reaction|리액션|unboxing|sketch|episode|recap|concert|tour|challenge|#shorts|현장|체험|다큐|docu(?:mentary)?|secret cut|mv shoot|filming|MV[를로가는도에]|commentary|BH2ND|^INSIDE\b|MV\s+BTS|해석|rehearsal|리허설|awards?|시상식|뮤직비디오상|MV 속|제작기|궁금|\bep\.\s*\d/i;

export const NON_MUSIC_RE =
  /PUBG|배틀그라운드|\bCF\b|광고|commercial|collab film|brand film/i;

export const MIN_MV_SECONDS = 100;

export const ACTIVE_CLASSES = new Set(["main_mv", "special_video"]);

/** Classes worth persisting even when inactive (mirrors discover's keep policy). */
export const KEEP_CLASSES = new Set([
  "main_mv",
  "special_video",
  "cover_video",
  "japanese_version",
  "dance_practice",
  "performance_video",
  "visualizer",
  "audio_only",
  "lyric_video",
]);

export function classify(title: string): string {
  const t = String(title).toLowerCase();
  if (/dance practice|안무|choreography/.test(t)) return "dance_practice";
  if (/performance (ver|mv|video)|dance performance|stage ver|live clip|live stage/.test(t)) {
    return "performance_video";
  }
  if (/visualizer/.test(t)) return "visualizer";
  if (/official audio|audio only/.test(t)) return "audio_only";
  if (/lyric/.test(t)) return "lyric_video";
  if (/japanese ver|jp ver|japan ver|- japanese/.test(t)) return "japanese_version";
  if (/special\s*(video|clip|film)|스페셜\s*(영상|클립)/i.test(title) && !REJECT_RE.test(title)) {
    return "special_video";
  }
  if (/\bcover\b/i.test(title) && !REJECT_RE.test(title)) return "cover_video";
  if (MV_RE.test(title) && !REJECT_RE.test(title)) return "main_mv";
  return "other";
}

export function stripFeat(title: string): string {
  return String(title).replace(/\((?:feat|ft)\.?[^)]*(?:\([^)]*\)[^)]*)*\)/gi, " ");
}

export function durationSeconds(iso: string | undefined | null): number | null {
  const m = String(iso ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Index where the act name matches in the title, or -1. */
export function nameMatchIndex(title: string, name: string): number {
  if (!name) return -1;
  if (/^[\x00-\x7F]+$/.test(name)) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`(?:^|[^A-Za-z0-9])(${esc})(?=[^A-Za-z0-9]|$)`, "i").exec(title);
    return m ? m.index + m[0].indexOf(m[1]) : -1;
  }
  return title.indexOf(name);
}

export type ActGroup = {
  group_id: string;
  name: string;
  name_ko: string | null;
  aliases: string; // JSON array
};

const QUOTE_RE = /['"‘’“”「『]/;

export function buildGroupMatcher(groups: ActGroup[]): (title: string) => string | null {
  const patterns: { group: string; name: string }[] = [];
  for (const g of groups) {
    const names = [g.name, g.name_ko, ...(JSON.parse(g.aliases || "[]") as string[])];
    for (const name of names) {
      if (name) patterns.push({ group: g.group_id, name });
    }
  }
  patterns.sort((a, b) => b.name.length - a.name.length);
  return (title: string) => {
    // K-pop MV titles put the artist BEFORE the quoted song title
    // ("ARTIST 'SONG' MV") — a match must START before the first quote char.
    const q = title.search(QUOTE_RE);
    for (const p of patterns) {
      const i = nameMatchIndex(title, p.name);
      if (i >= 0 && (q < 0 || i < q)) return p.group;
    }
    return null;
  };
}
