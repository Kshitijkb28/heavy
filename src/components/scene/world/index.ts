/** U4 — World, lighting, volumes. I1 mounts `World`, `Lights`, `Lamp`, `Beacon`, `HandLight`, `Volumes` inside the stage. */
export { World, type WorldProps } from "./World";
export { Lights, type LightsProps } from "./Lights";
export { Beacon, type BeaconProps } from "./Beacon";
export { HandLight } from "./HandLight";
export { Lamp, type LampProps } from "./Lamp";
export { Volumes, type VolumesProps } from "./Volumes";
export { Haze } from "./Haze";
export { Bays, type BaysProps } from "./Bays";
export { Tubes, type TubesProps } from "./Tubes";
export { Door, type DoorProps } from "./Door";
export { Mast } from "./Mast";
export { VolumeCone, type VolumeConeProps } from "./VolumeCone";
export { Dust, type DustProps } from "./Dust";
export { GlowSprite, type GlowSpriteProps } from "./GlowSprite";
export * from "./layout";
export * from "./drives";
export { TOKENS, createConcreteMaterial, createWallMaterial, createSteelMaterial, createIronPlateMaterial, createEmissiveMaterial, createNoiseTexture } from "./materials";
