import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import type { Vec3 } from "@/lib/contracts";
import { aspectOf, fitDistance, fitDistanceBox, halfExtents, projectToNdc, solveTargetForNdc, visibleHeight, visibleWidth } from "./frame";

function threeNdc(position: Vec3, target: Vec3, point: Vec3, fov: number, aspect: number): [number, number] {
  const cam = new PerspectiveCamera(fov, aspect, 0.1, 500);
  cam.position.set(...position);
  cam.lookAt(new Vector3(...target));
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  const p = new Vector3(...point).project(cam);
  return [p.x, p.y];
}

describe("frame maths", () => {
  it("fits a block to a fraction of the viewport width", () => {
    const d = fitDistance(5.6, 32, 1.6, 0.72);
    expect(visibleWidth(d, 32, 1.6) * 0.72).toBeCloseTo(5.6, 9);
    expect(d).toBeCloseTo(5.6 / (2 * Math.tan((16 * Math.PI) / 180) * 1.6 * 0.72), 9);
    expect(visibleHeight(10, 32)).toBeCloseTo(2 * 10 * Math.tan((16 * Math.PI) / 180), 9);
    expect(halfExtents(32, 2).x).toBeCloseTo(halfExtents(32, 1).y * 2, 12);
  });

  it("box fit is limited by height on wide screens", () => {
    const byWidth = fitDistance(5.6, 32, 2.4, 0.72);
    const box = fitDistanceBox(5.6, 2.3, 32, 2.4, 0.72, 0.5);
    expect(box).toBeGreaterThan(byWidth);
    expect(visibleHeight(box, 32) * 0.5).toBeCloseTo(2.3, 9);
    // on 16:10 the width wins
    expect(fitDistanceBox(5.6, 2.3, 32, 1.6, 0.72, 0.5)).toBeCloseTo(fitDistance(5.6, 32, 1.6, 0.72), 9);
  });

  it("classifies aspects", () => {
    expect(aspectOf(1440, 900)).toBe("landscape");
    expect(aspectOf(390, 844)).toBe("portrait");
    expect(aspectOf(1024, 1024)).toBe("landscape");
  });

  it("projects points like a three PerspectiveCamera", () => {
    const cases: Array<[Vec3, Vec3, Vec3, number]> = [
      [[0, 1, 8.5], [0, 2.4, 0], [2.8, 2.4, 0], 1.6],
      [[7.2, 2, 3], [5, 3.4, -4.5], [0, 2.4, 0], 1.78],
      [[-1.2, 2.1, -17.5], [2.6, 2.4, -24], [2.6, 3.1, -24], 0.462],
      [[1.2, 1.95, -63.9], [0.3, 2.3, -35], [-1, 1, -50], 1.33],
    ];
    for (const [position, target, point, aspect] of cases) {
      const [x, y] = threeNdc(position, target, point, 32, aspect);
      const ndc = projectToNdc(position, target, point, 32, aspect);
      expect(ndc.depth).toBeGreaterThan(0);
      expect(ndc.x).toBeCloseTo(x, 9);
      expect(ndc.y).toBeCloseTo(y, 9);
    }
    expect(projectToNdc([0, 0, 0], [0, 0, -1], [0, 0, 5], 32, 1).depth).toBeLessThan(0);
  });

  it("solves a look-at target that puts a point at the requested NDC (checked with three)", () => {
    const positions: Vec3[] = [
      [0, 1, 8.5],
      [7.2, 2, 3],
      [-1.2, 2.1, -17.5],
      [2.5, 2.6, -43],
      [1.2, 1.95, -63.9],
    ];
    const points: Vec3[] = [
      [0, 2.4, 0],
      [5, 3.4, -4.5],
      [2.6, 2.4, -24],
      [11.9, 2.7, -44],
      [0.3, 2.3, -35],
    ];
    const ndcs: Array<[number, number]> = [
      [0, 0],
      [0.55, 0.05],
      [-0.5, 0.15],
      [0, 0.45],
      [0.45, -0.3],
    ];
    for (const aspect of [0.462, 1, 1.6, 2.4]) {
      for (const position of positions) {
        for (const point of points) {
          for (const ndc of ndcs) {
            const target = solveTargetForNdc(position, point, ndc, 32, aspect);
            const [x, y] = threeNdc(position, target, point, 32, aspect);
            expect(x).toBeCloseTo(ndc[0], 6);
            expect(y).toBeCloseTo(ndc[1], 6);
            // the target sits at the point's distance, in front of the camera
            const d = Math.hypot(target[0] - position[0], target[1] - position[1], target[2] - position[2]);
            const dp = Math.hypot(point[0] - position[0], point[1] - position[1], point[2] - position[2]);
            expect(d).toBeCloseTo(dp, 9);
          }
        }
      }
    }
  });

  it("keeps the camera near level (never flips upside down)", () => {
    const target = solveTargetForNdc([0, 1, 8.5], [0, 2.4, 0], [0, 0.9], 32, 1.6);
    // the point high in frame → the camera pitches down, the target below the point
    expect(target[1]).toBeLessThan(2.4);
    const cam = new PerspectiveCamera(32, 1.6);
    cam.position.set(0, 1, 8.5);
    cam.lookAt(new Vector3(...target));
    expect(cam.up.y).toBe(1);
    expect(Math.abs(cam.rotation.z)).toBeLessThan(1e-9);
  });
});
