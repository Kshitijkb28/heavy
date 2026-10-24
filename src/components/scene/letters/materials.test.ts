import { describe, expect, it } from "vitest";
import { BackSide, BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { sceneState } from "@/lib/scene-state";
import {
  HEAT_INTENSITY,
  TOKENS,
  createChainMaterial,
  createFloorMaterial,
  createIronMaterial,
  createReflectionMaterial,
  cssToken,
  getHeat,
  setHeat,
  syncFloorMaterial,
} from "./materials";

describe("materials", () => {
  it("builds the iron preset from the tokens", () => {
    const m = createIronMaterial();
    expect(m.metalness).toBe(0.9);
    expect(m.roughness).toBe(0.45);
    expect(`#${m.color.getHexString()}`).toBe(TOKENS.iron);
    expect(m.uniforms.uHeat.value).toBe(0);
    expect(m.anisotropy).toBe(0);
    expect(createIronMaterial({ anisotropy: true }).anisotropy).toBeCloseTo(0.6, 9);
  });
  it("builds a transparent back-side reflection with fade uniforms and a mirrored IBL patch", () => {
    const m = createReflectionMaterial({ fade: 4, strength: 0.4 });
    expect(m.transparent).toBe(true);
    expect(m.side).toBe(BackSide);
    expect(m.uniforms.uFade.value).toBe(4);
    expect(m.uniforms.uStrength.value).toBe(0.4);
    expect(m.uniforms.uNormalSign.value).toBe(-1);
    const csm = (m as unknown as { __csm: { patchMap?: Record<string, Record<string, string>> } }).__csm;
    const patch = csm.patchMap?.["*"]?.["#include <envmap_physical_pars_fragment>"];
    expect(patch).toContain("reflectVec.y = -reflectVec.y;");
    expect(patch).toContain("worldNormal.y = -worldNormal.y;");
  });
  it("builds a floor that does not write depth and follows the beacon", () => {
    const m = createFloorMaterial({ wetness: 0.5 });
    expect(m.depthWrite).toBe(false);
    expect(m.uniforms.uWet.value).toBe(0.5);
    expect(m.uniforms.uBeaconPos.value.toArray()).toEqual([-6, 4.5, -3]);
    sceneState.beaconAngle = 1.25;
    syncFloorMaterial(m, 3);
    expect(m.uniforms.uBeacon.value).toBe(1.25);
    expect(m.uniforms.uTime.value).toBe(3);
    sceneState.beaconAngle = 0;
  });
  it("builds black steel for the chains", () => {
    const m = createChainMaterial();
    expect(m.metalness).toBe(1);
    expect(m.roughness).toBe(0.35);
  });
  it("falls back to the hex tokens outside a browser", () => {
    expect(cssToken("signal")).toBe(TOKENS.signal);
  });
});

describe("setHeat", () => {
  it("clamps and writes the heat uniform of the letter and its reflection", () => {
    const mesh = new Mesh(new BoxGeometry(), createIronMaterial());
    const reflection = new Mesh(new BoxGeometry(), createReflectionMaterial());
    mesh.userData.reflection = reflection;
    setHeat(mesh, 0.5);
    expect(getHeat(mesh)).toBe(0.5);
    expect((mesh.material as ReturnType<typeof createIronMaterial>).uniforms.uHeat.value).toBe(0.5);
    expect((reflection.material as ReturnType<typeof createReflectionMaterial>).uniforms.uHeat.value).toBe(0.5);
    setHeat(mesh, 7);
    expect(getHeat(mesh)).toBe(1);
    setHeat(mesh, -1);
    expect(getHeat(mesh)).toBe(0);
    setHeat(mesh, Number.NaN);
    expect(getHeat(mesh)).toBe(0);
  });
  it("drives emissiveIntensity on a plain standard material", () => {
    const mat = new MeshStandardMaterial();
    const mesh = new Mesh(new BoxGeometry(), mat);
    setHeat(mesh, 0.5);
    expect(mat.emissiveIntensity).toBeCloseTo(0.5 * HEAT_INTENSITY, 9);
    expect(`#${mat.emissive.getHexString()}`).toBe(TOKENS.signal);
    expect(getHeat(new Mesh())).toBe(0);
  });
});
