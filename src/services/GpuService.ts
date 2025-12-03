import { detectGpuMode as detectNativeGpuMode } from "./GpuService.native";
import { detectGpuMode as detectWebGpuMode } from "./GpuService.web";
import type { GpuMode } from "./GpuService.types";

const isWebRuntime = typeof document !== "undefined" || typeof window !== "undefined";

export type { GpuMode } from "./GpuService.types";

export const detectGpuMode = async (): Promise<GpuMode> => {
  const detect = isWebRuntime ? detectWebGpuMode : detectNativeGpuMode;
  return detect();
};
