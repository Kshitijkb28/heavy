import { describe, expect, it } from "vitest";
import { jsonLd } from "./json-ld";

describe("jsonLd", () => {
  it("cannot close its <script> whatever the content says (editable names reach it)", () => {
    const data = { "@type": "Organization", name: "</script><script src=//x.yz>", note: "a < b & c > d" };
    const out = jsonLd(data);
    expect(out).not.toContain("<");
    expect(JSON.parse(out)).toEqual(data);
  });
});
