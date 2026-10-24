import { describe, expect, it, vi } from "vitest";
import { copyText } from "./useClipboard";

describe("copyText", () => {
  it("uses the async Clipboard API when it exists", async () => {
    const writeText = vi.fn(async () => {});
    expect(await copyText("hi", { navigator: { clipboard: { writeText } } })).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    const area = { value: "", style: {}, setAttribute: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn() };
    const document = {
      body: { appendChild: vi.fn() },
      createElement: vi.fn(() => area),
      execCommand: vi.fn(() => true),
    } as unknown as Document;
    expect(await copyText("hello", { navigator: { clipboard: { writeText } }, document })).toBe(true);
    expect(area.value).toBe("hello");
    expect(area.remove).toHaveBeenCalled();
  });

  it("resolves false, never throws, without any clipboard", async () => {
    expect(await copyText("x", {})).toBe(false);
    expect(await copyText("x", { navigator: {} })).toBe(false);
  });
});
