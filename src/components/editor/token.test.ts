import { describe, expect, it } from "vitest";
import { clearToken, readToken, saveToken, type TokenStores } from "./token";

/** a Storage stand-in: the browser's own is not in the node test environment */
function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}
const stores = (): TokenStores => ({ session: memory(), local: memory() });

describe("the editor's token", () => {
  it("stays in this tab unless you ask to be remembered", () => {
    const s = stores();
    saveToken("t1", false, s);
    expect(s.session!.getItem("heavy:gh-token")).toBe("t1");
    expect(s.local!.getItem("heavy:gh-token")).toBeNull();
    expect(readToken(s)).toBe("t1");
  });

  it("is remembered on the device only on request, and not twice", () => {
    const s = stores();
    saveToken("t1", false, s);
    saveToken("t2", true, s);
    expect(s.local!.getItem("heavy:gh-token")).toBe("t2");
    expect(s.session!.getItem("heavy:gh-token")).toBeNull();
    expect(readToken(s)).toBe("t2");
  });

  it("is gone from both places after sign-out, and survives storage that throws", () => {
    const s = stores();
    saveToken("t", true, s);
    clearToken(s);
    expect(readToken(s)).toBeNull();
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } } as unknown as Storage;
    expect(() => saveToken("t", false, { session: broken, local: broken })).not.toThrow();
    expect(readToken({ session: broken, local: null })).toBeNull();
  });
});
