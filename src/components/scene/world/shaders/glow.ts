import { glslFogFade } from "./noise";

/** GlowSprite: a camera-facing radial quad, additive, standing in for Bloom on the mid tier (≤ 10 on screen). */
export const glowVertex = /* glsl */ `
uniform float uSize;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = position.xy;
  vec4 mvPosition = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mvPosition.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const glowFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float r = length(vUv) * 2.0;
  float halo = pow(max(0.0, 1.0 - r), 2.4);
  float core = pow(max(0.0, 1.0 - r * 2.6), 2.0);
  vec3 col = uColor * (uIntensity * (halo + core * 0.8));
  ${glslFogFade}
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
