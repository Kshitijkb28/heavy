import { describe, expect, it } from "vitest";
import { SECTION_ORDER } from "@/lib/contracts";
import { HERO_VISIBLE_UNTIL, T_MAX, activeSectionAt, buildScrollMap, heroVisibleAt, isSectionId, nextVelocity, scrollToT, sectionIndex, tToScrollY, type MeasuredSection } from "./scroll-map";

/** eight contiguous sections of `height` px each, hero at 0, all with the same scroll margin */
function contiguous(height = 1000, scrollMargin = 64, heights?: Partial<Record<string, number>>): MeasuredSection[] {
  let top = 0;
  return SECTION_ORDER.map((id) => {
    const h = heights?.[id] ?? height;
    const s = { id, top, height: h, scrollMargin };
    top += h;
    return s;
  });
}

describe("scroll map", () => {
  it("orders sections by SECTION_ORDER, drops strangers and duplicates, anchors at top − scroll margin", () => {
    const shuffled = [...contiguous()].reverse();
    shuffled.push({ id: "about", top: 999, height: 1, scrollMargin: 0 });
    shuffled.push({ id: "banner" as never, top: 5, height: 1, scrollMargin: 0 });
    const map = buildScrollMap(shuffled);
    expect(map.spans.map((s) => s.id)).toEqual([...SECTION_ORDER]);
    expect(map.spans[0].anchor).toBe(0);
    expect(map.spans[1].anchor).toBe(1000 - 64);
    expect(map.spans[1].top).toBe(1000);
    expect(map.spans[0].span).toBe(936);
    expect(map.spans[1].span).toBe(1000);
    expect(map.spans.at(-1)?.span).toBe(1000);
  });

  it("maps scroll to t = index + progress, continuous and monotonic", () => {
    const map = buildScrollMap(contiguous());
    expect(scrollToT(map, 0)).toBe(0);
    expect(scrollToT(map, 936)).toBe(1);
    expect(scrollToT(map, 936 + 500)).toBeCloseTo(1.5, 12);
    expect(scrollToT(map, 2936)).toBe(3);
    expect(scrollToT(map, 6936)).toBe(T_MAX);
    expect(scrollToT(map, 99999)).toBe(T_MAX);
    expect(scrollToT(map, -50)).toBe(0);
    let prev = 0;
    for (let y = 0; y <= 8000; y += 7) {
      const t = scrollToT(map, y);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t - prev).toBeLessThan(0.02);
      prev = t;
    }
  });

  it("stays continuous when sections have gaps between them", () => {
    const sections: MeasuredSection[] = SECTION_ORDER.map((id, i) => ({ id, top: i * 1400, height: 1000, scrollMargin: 64 }));
    const map = buildScrollMap(sections);
    let prev = 0;
    for (let y = 0; y <= 10000; y += 5) {
      const t = scrollToT(map, y);
      expect(t - prev).toBeLessThan(0.01);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(scrollToT(map, 1400 - 64)).toBe(1);
  });

  it("inverts with tToScrollY", () => {
    const map = buildScrollMap(contiguous(1000, 64, { projects: 3000, footer: 400 }));
    for (const t of [0, 0.25, 1, 1.9, 3, 3.333, 3.667, 4, 5.5, 6, 6.99]) {
      expect(scrollToT(map, tToScrollY(map, t))).toBeCloseTo(t, 9);
    }
    expect(tToScrollY(map, -1)).toBe(0);
    expect(tToScrollY(map, 7)).toBe(map.spans.at(-1)!.anchor);
    expect(tToScrollY(map, 42)).toBe(map.spans.at(-1)!.anchor);
  });

  it("jumps indices when sections are missing, and copes with none", () => {
    const map = buildScrollMap([
      { id: "hero", top: 0, height: 1000, scrollMargin: 0 },
      { id: "projects", top: 1000, height: 1000, scrollMargin: 0 },
    ]);
    expect(scrollToT(map, 500)).toBeCloseTo(1.5, 9);
    expect(scrollToT(map, 1000)).toBe(3);
    expect(scrollToT(map, 1999)).toBe(3);
    const empty = buildScrollMap([]);
    expect(scrollToT(empty, 123)).toBe(0);
    expect(tToScrollY(empty, 3)).toBe(0);
    expect(activeSectionAt(empty, 10, 800)).toBe("hero");
  });

  it("picks the active section by viewport centre", () => {
    const map = buildScrollMap(contiguous());
    expect(activeSectionAt(map, 0, 800)).toBe("hero");
    expect(activeSectionAt(map, 599, 800)).toBe("hero");
    expect(activeSectionAt(map, 600, 800)).toBe("about");
    expect(activeSectionAt(map, 6600, 800)).toBe("footer");
    expect(activeSectionAt(map, 6599, 800)).toBe("contact");
  });

  it("knows the section ids", () => {
    expect(sectionIndex("projects")).toBe(3);
    expect(sectionIndex("nope")).toBe(-1);
    expect(isSectionId("footer")).toBe(true);
    expect(isSectionId("content")).toBe(false);
  });

  it("marks the hero visible until the camera has left it", () => {
    expect(heroVisibleAt(0)).toBe(true);
    expect(heroVisibleAt(HERO_VISIBLE_UNTIL - 0.01)).toBe(true);
    expect(heroVisibleAt(HERO_VISIBLE_UNTIL)).toBe(false);
  });

  it("smooths scroll velocity and ignores zero-time samples", () => {
    expect(nextVelocity(0, 100, 100)).toBeCloseTo(600, 9);
    expect(nextVelocity(600, 100, 100)).toBeCloseTo(840, 9);
    expect(nextVelocity(600, 100, 0)).toBe(600);
    expect(nextVelocity(600, 100, -5)).toBe(600);
  });
});

describe("scroll map: project sub-stops follow the measured cards", () => {
  /** contiguous sections, projects (index 3) holding cards of the given heights */
  function withCards(cardHeights: number[], scrollMargin = 64): MeasuredSection[] {
    const projectsHeight = cardHeights.reduce((a, b) => a + b, 0);
    const sections = contiguous(1000, scrollMargin, { projects: projectsHeight });
    const p = sections.find((s) => s.id === "projects")!;
    let top = p.top;
    p.stops = cardHeights.map((h) => {
      const t = top;
      top += h;
      return t;
    });
    return sections;
  }

  it("lands t = 3 + i/n exactly when card i reaches the anchor, however uneven the cards", () => {
    const sections = withCards([1400, 700, 2100, 900]);
    const map = buildScrollMap(sections);
    const stops = sections.find((s) => s.id === "projects")!.stops!;
    stops.forEach((top, i) => expect(scrollToT(map, top - 64)).toBeCloseTo(3 + i / 4, 12));
    expect(scrollToT(map, map.spans[4].anchor)).toBe(4);
  });

  it("stays continuous and monotonic across the sub-stops, and tToScrollY inverts it", () => {
    const map = buildScrollMap(withCards([1400, 700, 2100]));
    let prev = 0;
    for (let y = 0; y <= 9000; y += 5) {
      const t = scrollToT(map, y);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t - prev).toBeLessThan(0.01);
      prev = t;
    }
    for (const t of [3, 3.1, 1 / 3 + 3, 3.5, 2 / 3 + 3, 3.9]) expect(scrollToT(map, tToScrollY(map, t))).toBeCloseTo(t, 9);
  });

  it("keeps the plain mapping without cards or with one card", () => {
    const plain = buildScrollMap(contiguous());
    const one = buildScrollMap(withCards([1000]));
    for (const y of [0, 2936, 3000, 3436, 3900]) expect(scrollToT(one, y)).toBeCloseTo(scrollToT(plain, y), 12);
  });
});
