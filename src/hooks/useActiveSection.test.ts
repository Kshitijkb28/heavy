import { describe, expect, it } from "vitest";
import { SECTION_ORDER } from "@/lib/contracts";
import type { SectionRect } from "@/lib/registry";
import { activeSectionAt, stationFor } from "./useActiveSection";

const H = 900;
const rects: SectionRect[] = SECTION_ORDER.map((id, i) => ({ id, top: i * H, height: H }));

describe("activeSectionAt", () => {
  it("picks the section holding the viewport centre", () => {
    expect(activeSectionAt(rects, 0, H)).toBe("hero");
    expect(activeSectionAt(rects, 300, H)).toBe("hero"); // centre 750
    expect(activeSectionAt(rects, 500, H)).toBe("about"); // centre 950
    expect(activeSectionAt(rects, 450, H)).toBe("about"); // centre exactly on the boundary belongs to the next section
    expect(activeSectionAt(rects, 6 * H, H)).toBe("contact");
  });
  it("clamps before the first and after the last section", () => {
    expect(activeSectionAt(rects, -2000, H)).toBe("hero");
    expect(activeSectionAt(rects, 99_999, H)).toBe("footer");
  });
  it("tolerates unsorted or missing rects", () => {
    expect(activeSectionAt([...rects].reverse(), 500, H)).toBe("about");
    expect(activeSectionAt([], 500, H)).toBe("hero");
  });
});

describe("stationFor", () => {
  it("maps every content section to its own station", () => {
    expect(stationFor("hero").code).toBe("00");
    expect(stationFor("about").label).toBe("ABOUT");
    expect(stationFor("contact").code).toBe("06");
  });
  it("lights CONTACT at the footer", () => {
    expect(stationFor("footer").id).toBe("contact");
  });
});
