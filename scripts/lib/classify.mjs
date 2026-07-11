/** Title/duration classification rules shared by discover + clean. */

// "MV" needs boundaries: 'MVP' must not match.
export const MV_RE =
  /(?:^|[^A-Za-z])M\/?V(?![A-Za-z])|Official\s*(Music\s*)?Video|뮤직비디오|(?:^|[^가-힣A-Za-z])뮤비(?![가-힣])|Music Video/i;

// Derivative / promo content that is never a main MV, whatever the title claims.
export const REJECT_RE =
  /teaser|trailer|behind|making|i-talk|interview|vlog|relay|jacket|highlight|medley|audition|fanmeeting|촬영|찍어|비하인드|티저|메이킹|remix|sped up|dance practice|안무|choreography|performance (ver|mv|video)|dance performance|live clip|live stage|special live|fan ?cam|셀프캠|self ?cam|직캠|reaction|리액션|unboxing|sketch|episode|recap|concert|tour|challenge|#shorts|현장|체험|다큐|docu(?:mentary)?|secret cut|mv shoot|filming|MV[를로가는도에]|commentary|BH2ND|^INSIDE\b|MV\s+BTS|해석|rehearsal|리허설|awards?|시상식|뮤직비디오상|MV 속|제작기|궁금|\bep\.\s*\d/i;

/**
 * Remove "(Feat. X)" / "(feat X)" segments so a girl-group member credited as
 * a featured artist on someone else's song does not claim the whole video
 * (e.g. JOOHONEY 'Push (Feat. 레이 (IVE))').
 */
export function stripFeat(title) {
  return String(title).replace(/\((?:feat|ft)\.?[^)]*(?:\([^)]*\)[^)]*)*\)/gi, " ");
}

// Non-music brand/game tie-ins that still say "MV" in the title.
export const NON_MUSIC_RE = /PUBG|배틀그라운드|\bCF\b|광고|commercial|collab film|brand film/i;

// Minimum runtime for a real MV; Shorts/clips sit below this.
export const MIN_MV_SECONDS = 100;

export function classify(title) {
  const t = String(title).toLowerCase();
  if (/dance practice|안무|choreography/.test(t)) return "dance_practice";
  if (/performance (ver|mv|video)|dance performance|stage ver|live clip|live stage/.test(t)) {
    return "performance_video";
  }
  if (/visualizer/.test(t)) return "visualizer";
  if (/official audio|audio only/.test(t)) return "audio_only";
  if (/lyric/.test(t)) return "lyric_video";
  if (/japanese ver|jp ver|japan ver|- japanese/.test(t)) return "japanese_version";
  // K-pop labels release fan songs / b-sides / JP singles as dedicated
  // "Special Video/Clip/Film" MVs (SM, Dreamcatcher, fromis_9 …).
  if (/special\s*(video|clip|film)|스페셜\s*(영상|클립)/i.test(title) && !REJECT_RE.test(title)) {
    return "special_video";
  }
  if (/\bcover\b/i.test(title) && !REJECT_RE.test(title)) return "cover_video";
  if (MV_RE.test(title) && !REJECT_RE.test(title)) return "main_mv";
  return "other";
}

/** Classes whose rows the collector actively snapshots when a group matched. */
export const ACTIVE_CLASSES = new Set(["main_mv", "special_video"]);

/** Apply the shared rules to one video row (mutates and returns it). */
export function reclassify(v, group, channelKind) {
  const title = String(v.title ?? "");
  const seconds = v.duration_seconds ?? null;
  let video_class = classify(title);
  if (seconds != null && seconds < MIN_MV_SECONDS) video_class = "short_form";

  const active =
    ACTIVE_CLASSES.has(video_class) &&
    Boolean(group) &&
    !NON_MUSIC_RE.test(title) &&
    channelKind !== "distributor" &&
    (seconds == null || seconds >= MIN_MV_SECONDS);

  v.group = group ?? v.group ?? "unknown";
  v.video_class = video_class;
  v.active = active;
  return v;
}
