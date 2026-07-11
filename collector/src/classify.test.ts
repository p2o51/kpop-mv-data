import { describe, expect, it } from "vitest";
import {
  MV_RE,
  buildGroupMatcher,
  classify,
  durationSeconds,
  stripFeat,
} from "./classify";
import { shardAt, DISCOVERY_SHARDS } from "./discovery";

const GROUPS = [
  { group_id: "dreamcatcher", name: "Dreamcatcher", name_ko: "드림캐쳐", aliases: '["드림캐쳐"]' },
  { group_id: "say-my-name", name: "SAY MY NAME", name_ko: "세이마이네임", aliases: "[]" },
  { group_id: "miyeon", name: "MIYEON", name_ko: "미연", aliases: '["미연"]' },
  { group_id: "lisa", name: "LISA", name_ko: "리사", aliases: "[]" },
  { group_id: "girls-generation", name: "Girls' Generation", name_ko: "소녀시대", aliases: '["SNSD"]' },
  { group_id: "meovv", name: "MEOVV", name_ko: "미야오", aliases: "[]" },
  { group_id: "aespa", name: "aespa", name_ko: "에스파", aliases: "[]" },
];

describe("MV_RE boundaries", () => {
  it("does not match MV inside MVP or MEOVV", () => {
    expect(MV_RE.test("RESCENE 'MVP' (Christmas ver.) Special Live")).toBe(false);
    expect(MV_RE.test("INSIDE MEOVV")).toBe(false);
  });
  it("matches explicit MV tokens", () => {
    expect(MV_RE.test("aespa 에스파 'LEMONADE' MV")).toBe(true);
    expect(MV_RE.test("BLACKPINK - ‘GO’ M/V")).toBe(true);
    expect(MV_RE.test("i-dle 'Crow' Official Music Video")).toBe(true);
  });
});

describe("classify", () => {
  it("rejects commentary / behind / rehearsal content", () => {
    expect(classify("Hearts2Hearts ’RUDE!’ MV BH2ND #2")).toBe("other");
    expect(classify("선미(SUNMI) 'BLUE!' MV COMMENTARY")).toBe("other");
    expect(classify("JENNIE - Mantra MV Rehearsal")).toBe("other");
    expect(classify("IVE, David Guetta - Supernova Love MV BTS")).toBe("other");
  });
  it("classes special videos", () => {
    expect(classify("Red Velvet 레드벨벳 'Sweet Dreams' Special Video")).toBe("special_video");
    expect(classify("ILLIT (아일릿) 'Almond Chocolate' Special Film")).toBe("special_video");
  });
  it("classes performance MVs as performance_video", () => {
    expect(classify('MADEIN - "PUNG!" PERFORMANCE MV')).toBe("performance_video");
  });
});

describe("group matcher quote rule", () => {
  const match = buildGroupMatcher(GROUPS);
  it("does not attribute another act's song named after a group", () => {
    expect(match("NCT WISH 엔시티 위시 'Dreamcatcher' Special Video")).toBe(null);
    expect(match(stripFeat("j-hope 'MONA LISA' Official MV"))).toBe(null);
  });
  it("prefers the artist-position match over a song-title collision", () => {
    expect(match("미연 (MIYEON) 'Say My Name' Official Music Video")).toBe("miyeon");
  });
  it("survives the apostrophe in Girls' Generation", () => {
    expect(match("Girls' Generation 소녀시대 'FOREVER 1' MV")).toBe("girls-generation");
  });
  it("strips feat credits before matching", () => {
    expect(match(stripFeat("JOOHONEY 주헌 'Push (Feat. 레이 (IVE))' MV"))).toBe(null);
  });
});

describe("durationSeconds", () => {
  it("parses ISO durations", () => {
    expect(durationSeconds("PT3M29S")).toBe(209);
    expect(durationSeconds("PT42S")).toBe(42);
    expect(durationSeconds("PT1H2M3S")).toBe(3723);
    expect(durationSeconds(undefined)).toBe(null);
  });
});

describe("discovery shards", () => {
  it("cycles through all shards across an hour of 10-minute ticks", () => {
    const shards = [0, 10, 20, 30, 40, 50].map((m) =>
      shardAt(new Date(Date.UTC(2026, 6, 10, 3, m))),
    );
    expect(new Set(shards).size).toBe(DISCOVERY_SHARDS);
  });
});
