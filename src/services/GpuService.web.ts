import type { GpuMode } from "./GpuService.types";

const hasWebGPU = async (): Promise<boolean> => {
  if (typeof navigator === "undefined") return false;
  const anyNavigator = navigator as Record<string, unknown>;
  if (!("gpu" in anyNavigator)) return false;

  try {
    const gpu = (anyNavigator.gpu ?? null) as GPU | null;
    if (!gpu || typeof gpu.requestAdapter !== "function") return false;
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch (error) {
    console.warn("WebGPU detection failed", error);
    return false;
  }
};

const hasWebGL2 = (): boolean => {
  if (typeof document === "undefined") return false;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: WebGL2RenderingContext | null = null;
  try {
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("webgl2");
    return Boolean(ctx);
  } catch (error) {
    console.warn("WebGL2 detection failed", error);
    return false;
  } finally {
    try {
      // Proactively release GL context if created
      const lose = (ctx as any)?.getExtension?.("WEBGL_lose_context");
      if (lose && typeof lose.loseContext === "function") {
        lose.loseContext();
      }
    } catch {}
    try {
      canvas?.remove?.();
    } catch {}
    canvas = null;
    ctx = null;
  }
};

const hasWebGL = (): boolean => {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl") || canvas.getContext("experimental-webgl" as any));
  } catch (error) {
    console.warn("WebGL detection failed", error);
    return false;
  }
};

export async function detectGpuMode(): Promise<GpuMode> {
  if (await hasWebGPU()) {
    return "webgpu";
  }

  if (hasWebGL2()) {
    return "webgl2";
  }

  if (hasWebGL()) {
    return "webgl";
  }

  return "none";
}
