import { detectBestGpuBackend as detectNativeBestGpuBackend } from "./GpuService.native";
import { detectBestGpuBackend as detectWebBestGpuBackend } from "./GpuService.web";
import type { GpuCheckResult } from "./GpuService.types";

const isWebRuntime = typeof document !== "undefined" || typeof window !== "undefined";

export type { GpuCheckResult } from "./GpuService.types";

export const detectBestGpuBackend = async (): Promise<GpuCheckResult> => {
  const detect = isWebRuntime ? detectWebBestGpuBackend : detectNativeBestGpuBackend;
  return detect();
};
