import { detectBestGpuBackend as detectNativeBestGpuBackend } from "./GpuService.native";
import { detectBestGpuBackend as detectWebBestGpuBackend } from "./GpuService.web";
import type { GpuCheckResult } from "./GpuService.types";

export type { GpuCheckResult } from "./GpuService.types";

const isWebRuntime = (): boolean =>
  typeof globalThis !== "undefined" &&
  (typeof (globalThis as any).document !== "undefined" || typeof (globalThis as any).window !== "undefined");

export const detectBestGpuBackend = async (): Promise<GpuCheckResult> => {
  const detect = isWebRuntime() ? detectWebBestGpuBackend : detectNativeBestGpuBackend;
  return detect();
};
