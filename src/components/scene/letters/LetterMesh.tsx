"use client";

/**
 * U2 — one iron glyph (docs/DESIGN.md §4). Renders the cached glyph geometry at the origin of its parent (U3's RigidBody
 * positions it) with its own iron material instance, and, when `reflections` is on, a child mesh that the reflection
 * shader mirrors about the world floor. `heat` 0–1 drives the signal-red emissive pulse on the bevels; U3 may also call
 * `setHeat(mesh, v)` imperatively every frame. Renders nothing until `loadTypeface()` has resolved.
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import type { Mesh } from "three";
import { getGlyph, isTypefaceReady } from "./glyphs";
import { createIronMaterial, createReflectionMaterial, setHeat } from "./materials";

export interface LetterMeshProps {
  char: string;
  curveSegments?: number;
  reflections?: boolean;
  anisotropy?: boolean;
  heat?: number;
  castShadow?: boolean;
  /** uniform scale of the glyph (slots carry it; 1 on landscape) */
  scale?: number;
  /** reflection alpha at the floor line (default 0.55) and the depth below the floor where it fades out (default 5 m) */
  reflectionStrength?: number;
  reflectionFade?: number;
}

function disposeLater(material: { dispose: () => void } | null): void {
  if (!material) return;
  if (typeof requestAnimationFrame !== "function") return material.dispose();
  requestAnimationFrame(() => requestAnimationFrame(() => material.dispose()));
}

export const LetterMesh = forwardRef<Mesh, LetterMeshProps>(function LetterMesh(
  { char, curveSegments = 4, reflections = false, anisotropy = false, heat = 0, castShadow = true, scale = 1, reflectionStrength = 0.55, reflectionFade = 5 },
  ref,
) {
  const ready = isTypefaceReady();
  const glyph = ready ? getGlyph(char, curveSegments) : null;
  const material = useMemo(() => createIronMaterial({ anisotropy }), [anisotropy]);
  const reflectionMaterial = useMemo(
    () => (reflections ? createReflectionMaterial({ anisotropy, strength: reflectionStrength, fade: reflectionFade }) : null),
    [reflections, anisotropy, reflectionStrength, reflectionFade],
  );
  // released two frames late: a remount (the physics hand-off) creates the replacement first, so three's program refcount
  // never reaches zero and the shaders are not re-linked
  useEffect(() => () => disposeLater(material), [material]);
  useEffect(() => () => disposeLater(reflectionMaterial), [reflectionMaterial]);

  const meshRef = useRef<Mesh | null>(null);
  const reflectionRef = useRef<Mesh | null>(null);
  // never pass `userData` through JSX: R3F would reassign the object on every render and drop the links set below
  const setMesh = useCallback(
    (mesh: Mesh | null) => {
      meshRef.current = mesh;
      if (mesh) mesh.userData.char = char;
      if (typeof ref === "function") ref(mesh);
      else if (ref) ref.current = mesh;
    },
    [ref, char],
  );

  // refs attach child-first, so the link to the reflection is made in an effect (after both refs exist)
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.userData.reflection = reflectionRef.current ?? undefined;
    setHeat(mesh, heat);
  }, [heat, material, reflectionMaterial]);

  if (!glyph) return null;
  return (
    <mesh ref={setMesh} geometry={glyph.geometry} material={material} castShadow={castShadow} receiveShadow scale={scale}>
      {reflectionMaterial && (
        <mesh ref={reflectionRef} geometry={glyph.geometry} material={reflectionMaterial} castShadow={false} receiveShadow={false} frustumCulled={false} />
      )}
    </mesh>
  );
});
