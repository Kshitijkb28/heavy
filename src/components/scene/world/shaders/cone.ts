import { glslFogFade, glslNoise } from "./noise";

/**
 * VolumeCone: an open cone rendered additively, double-sided, no depth write. Brightness = how much cone you look
 * through (|N·V|) × distance from the apex × 2-octave drifting noise × a fade where it meets the floor.
 */
export const coneVertex = /* glsl */ `
uniform float uHeight;
varying float vH;
varying vec3 vL;
varying vec3 vV;
varying vec3 vW;
#include <fog_pars_vertex>
void main() {
  vH = position.y / uHeight + 0.5;
  vL = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vV = normalize(cameraPosition - wp.xyz);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

export const coneFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uNoiseScale;
uniform float uFloorFade;
uniform float uSlope;
uniform float uFalloff;
uniform mat3 uRot;
varying float vH;
varying vec3 vL;
varying vec3 vV;
varying vec3 vW;
#include <fog_pars_fragment>
${glslNoise}
void main() {
  float rho = max(length(vL.xz), 1e-4);
  vec3 n = normalize(uRot * vec3(vL.x / rho, uSlope, vL.z / rho));
  float facing = abs(dot(n, normalize(vV)));
  float body = pow(smoothstep(0.0, 0.8, facing), 1.6);
  float h = clamp(vH, 0.0, 1.0);
  float along = smoothstep(0.0, 0.12, 1.0 - h) * pow(h, uFalloff);
  vec2 nuv = vec2(vW.x + vW.z * 0.37, vW.y) * uNoiseScale + vec2(uTime * 0.045, uTime * 0.11);
  float grain = 0.55 + 0.9 * noise2(nuv);
  float floorFade = smoothstep(0.0, uFloorFade, vW.y);
  vec3 col = uColor * (uIntensity * body * along * grain * floorFade);
  ${glslFogFade}
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;
