type AudioPipeline = Awaited<ReturnType<typeof import("@xenova/transformers")["pipeline"]>>;

let transformersImport: Promise<typeof import("@xenova/transformers")> | null = null;
const pipelineCache = new Map<string, Promise<AudioPipeline>>();

async function loadTransformers() {
  if (!transformersImport) {
    transformersImport = import("@xenova/transformers").then((mod) => {
      mod.env.allowLocalModels = true;
      return mod;
    });
  }
  return transformersImport;
}

export async function ensurePipeline(
  type: string,
  model: string,
  options?: Record<string, unknown>,
): Promise<AudioPipeline> {
  const key = `${type}:${model}`;
  let cached = pipelineCache.get(key);

  if (!cached) {
    const { pipeline } = await loadTransformers();
    const device =
      typeof navigator !== "undefined" && navigator.gpu ? "webgpu" : "auto";
    const pipelinePromise = pipeline(type as any, model, {
      quantized: true,
      device,
      progress_callback: (status) => {
        console.info(`[speech] ${type} loading`, status);
      },
      ...(options || {}),
    }).catch((err) => {
      pipelineCache.delete(key);
      throw err;
    });
    cached = pipelinePromise;
    pipelineCache.set(key, cached);
  }

  return cached;
}
