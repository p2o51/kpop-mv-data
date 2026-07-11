import { describe, expect, it } from "vitest";
import { cadenceFor, chunk, selectDueVideos, tiersDueAt } from "../src/scheduler";

describe("cadenceFor", () => {
  const now = Date.parse("2026-07-10T12:00:00Z");

  it("uses launch cadence for brand-new MVs", () => {
    const published = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    expect(cadenceFor(published, now).tier).toBe("launch");
  });

  it("uses archive cadence for old MVs", () => {
    const published = new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString();
    expect(cadenceFor(published, now).tier).toBe("archive");
  });
});

describe("tiersDueAt", () => {
  it("always includes launch on 10-minute ticks", () => {
    expect([...tiersDueAt(new Date("2026-07-10T12:10:00Z"))]).toEqual(["launch"]);
  });

  it("includes early/mid/archive on UTC midnight", () => {
    const due = tiersDueAt(new Date("2026-07-10T00:00:00Z"));
    expect(due.has("launch")).toBe(true);
    expect(due.has("early")).toBe(true);
    expect(due.has("mid")).toBe(true);
    expect(due.has("archive")).toBe(true);
  });
});

describe("selectDueVideos", () => {
  it("filters by due tier", () => {
    const now = Date.parse("2026-07-10T12:00:00Z");
    const videos = [
      {
        video_id: "aaaaaaaaaaa",
        channel_id: "UCxxxxxxxxxxxxxxxxxxxxxx",
        published_at: new Date(now - 60 * 60 * 1000).toISOString(),
        priority_boost: 0,
      },
      {
        video_id: "bbbbbbbbbbb",
        channel_id: "UCyyyyyyyyyyyyyyyyyyyyyy",
        published_at: new Date(now - 200 * 24 * 60 * 60 * 1000).toISOString(),
        priority_boost: 0,
      },
    ];
    const due = selectDueVideos(videos, new Set(["launch"]), now);
    expect(due.map((v) => v.video_id)).toEqual(["aaaaaaaaaaa"]);
  });
});

describe("chunk", () => {
  it("batches by 50", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
