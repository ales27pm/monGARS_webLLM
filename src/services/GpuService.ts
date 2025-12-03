export type GpuCheckResult = "webgpu" | "webgl" | "canvas" | "none";

const hasWebGPU = async (): Promise<boolean> => {
  if (typeof navigator === "undefined") return false;
  if (!("gpu" in navigator)) return false;

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    return adapter !== null;
  } catch (error) {
    console.error("WebGPU detection failed", error);
    return false;
  }
};

const hasWebGL = (): boolean => {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch (error) {
    console.error("WebGL detection failed", error);
    return false;
  }
};

export async function detectBestGpuBackend(): Promise<GpuCheckResult> {
  if (await hasWebGPU()) {
    return "webgpu";
  }

  if (hasWebGL()) {
    return "webgl";
  }

  if (typeof document !== "undefined") {
    return "canvas";
  }

  return "none";
}
