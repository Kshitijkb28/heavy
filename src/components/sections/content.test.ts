import { describe, expect, it } from "vitest";
import snapshot from "@/data/fixtures/content.base.json";
import { prettyUrl, splitEmail, splitOnce, visitLabel } from "./content";

describe("prettyUrl", () => {
  it("strips scheme, www and the trailing slash only", () => {
    expect(prettyUrl("https://www.linkedin.com/in/kshitij-bhardwaj-067240232")).toBe("linkedin.com/in/kshitij-bhardwaj-067240232");
    expect(prettyUrl("https://github.com/Kshitijkb28")).toBe("github.com/Kshitijkb28");
    expect(prettyUrl("https://www.ethara.ai/")).toBe("ethara.ai");
  });
});

describe("splitOnce", () => {
  it("links the company inside the now line without altering a character", () => {
    const { nowLine } = snapshot.profile;
    const parts = splitOnce(nowLine, "Ethara AI");
    expect(parts).not.toBeNull();
    expect(parts!.join("")).toBe(nowLine);
    expect(parts![1]).toBe("Ethara AI");
    expect(parts![0].endsWith("at ")).toBe(true);
  });
  it("returns null when the needle is missing or empty", () => {
    expect(splitOnce("abc", "x")).toBeNull();
    expect(splitOnce("abc", "")).toBeNull();
  });
});

describe("splitEmail", () => {
  it("splits the résumé email at the @", () => {
    expect(splitEmail(snapshot.profile.email)).toEqual({ local: "Kshitijbhardwajkb28", domain: "gmail.com" });
  });
  it("keeps a string without @ intact", () => {
    expect(splitEmail("nope")).toEqual({ local: "nope", domain: "" });
  });
});

describe("visitLabel", () => {
  it("names the domain", () => {
    expect(visitLabel("fuse.systems")).toBe("Visit fuse.systems");
  });
});
