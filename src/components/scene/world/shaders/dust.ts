import { glslFogFade } from "./noise";

/**
 * Dust: points that drift slowly and light up only inside a cone of light (apex, direction, cos half-angle, reach);
 * outside it their point size is 0 so they cost nothing. Soft disc, additive, no depth write.
 */
export const dustVertex = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
uniform vec3 uApex;
uniform vec3 uDir;
uniform float uCos;
uniform float uReach;
varying float vA;
#include <fog_pars_vertex>
void main() {
  float ph = aSeed.x;
  float sp = aSeed.y;
  vec3 p = position;
  p.x += sin(uTime * 0.11 * sp + ph) * 0.35;
  p.y += sin(uTime * 0.07 * sp + ph * 1.7) * 0.25 + sin(uTime * 0.023 * sp + ph * 0.3) * 0.3;
  p.z += cos(uTime * 0.09 * sp + ph * 0.6) * 0.35;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec3 toP = wp.xyz - uApex;
  float d = length(toP);
  float c = dot(toP / max(d, 1e-3), uDir);
  float lit = smoothstep(uCos - 0.05, uCos + 0.06, c) * (1.0 - smoothstep(uReach * 0.55, uReach, d));
  float tw = 0.5 + 0.5 * sin(uTime * aSeed.w + ph);
  vA = lit * (0.35 + 0.65 * tw);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = vA > 0.01 ? uSize * aSeed.z * uPixelRatio * (6.0 / max(-mvPosition.z, 0.5)) : 0.0;
  #include <fog_vertex>
}
`;

export const dustFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vA;
#include <fog_pars_fragment>
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  float disc = 1.0 - smoothstep(0.12, 0.5, r);
  vec3 col = uColor * (uIntensity * vA * disc);
  ${glslFogFade}
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
