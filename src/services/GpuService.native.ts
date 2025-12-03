import type { GpuMode } from "./GpuService.types";

const hasNativeGL = (): boolean => {
  const expoModules = (globalThis as Record<string, any> | undefined)?.ExpoModules;
  if (!expoModules) return false;

  const knownGlManagers = [
    "ExponentGLViewManager",
    "ExpoGLViewManager",
    "ExpoWebGL",
    "GLViewManager",
  ];

  return knownGlManagers.some((manager) => Boolean(expoModules[manager]));
};

export async function detectGpuMode(): Promise<GpuMode> {
  try {
    if (hasNativeGL()) {
      return "webgl";
    }
  } catch (error) {
    console.error("Native GPU detection failed", error);
  }

  return "none";
}
