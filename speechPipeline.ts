import { pipeline, env } from "@xenova/transformers";

type AudioPipeline = Awaited<ReturnType<typeof pipeline>>;

env.allowLocalModels = true;

const pipelineCache = new Map<string, Promise<AudioPipeline>>();

export async function ensurePipeline(
  type: string,
  model: string,
  options?: Record<string, unknown>,
): Promise<AudioPipeline> {
  const key = `${type}:${model}`;
  let cached = pipelineCache.get(key);

  if (!cached) {
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
