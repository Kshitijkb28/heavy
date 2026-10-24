import { describe, expect, it } from "vitest";
import { NAME_ROWS, PLACES, TRACK, heroCtas } from "./derived";
import { SECTION_ORDER } from "@/lib/contracts";

describe("derived", () => {
  it("has one place per section in order", () => {
    expect(PLACES.map((p) => p.id)).toEqual([...SECTION_ORDER]);
    expect(PLACES.map((p) => p.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
  it("tracks seven stations ending at contact", () => {
    expect(TRACK).toHaveLength(7);
    expect(TRACK.at(-1)?.id).toBe("contact");
  });
  it("hangs fifteen letters", () => {
    expect(NAME_ROWS.join("").length).toBe(15);
    expect(NAME_ROWS).toEqual(["KSHITIJ", "BHARDWAJ"]);
  });
  it("keeps the résumé link root-relative without a base path", () => {
    expect(heroCtas[2].href).toBe("/Kshitij-Bhardwaj-Resume.pdf");
  });
});
