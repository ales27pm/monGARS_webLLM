import { beforeEach, describe, expect, it, vi } from "vitest";
import { webLLMService } from "@/services/WebLLMService";
import { DEFAULT_MODEL_ID } from "../models";

const mockState = {
  payloads: [] as any[],
  engineCalls: 0,
  lastModelId: "",
  initOptions: undefined as unknown,
};

const transformersMockState = {
  tokenizerModelId: "",
  modelModelId: "",
};

vi.mock("@mlc-ai/web-llm", () => {
  const mockEngine = {
    chat: {
      completions: {
        create: vi.fn(async (payload: any) => {
          mockState.payloads.push(payload);
          return {
            choices: [
              {
                message: {
                  content: "Bonjour !",
                },
              },
            ],
          };
        }),
      },
    },
    runtimeStatsText: vi.fn(async () => "stats"),
    dispose: vi.fn(),
  };

  return {
    __esModule: true,
    CreateMLCEngine: vi.fn(async (modelId: string, initOptions: unknown) => {
      mockState.engineCalls += 1;
      mockState.lastModelId = modelId;
      mockState.initOptions = initOptions;
      return mockEngine;
    }),
    __mockState: mockState,
  };
});

vi.mock("@xenova/transformers", () => {
  const tokenizer = {
    apply_chat_template: vi.fn(() => ({ input_ids: [1, 2, 3] })),
    batch_decode: vi.fn(() => ["Réponse Liquid"]),
  };

  const model = {
    generate: vi.fn(async () => [1, 2, 3, 4]),
    dispose: vi.fn(async () => undefined),
  };

  return {
    __esModule: true,
    TextStreamer: class {
      constructor(_: unknown, __: unknown) {}
    },
    AutoTokenizer: {
      from_pretrained: vi.fn(async (modelId: string) => {
        transformersMockState.tokenizerModelId = modelId;
        return tokenizer;
      }),
    },
    AutoModelForCausalLM: {
      from_pretrained: vi.fn(async (modelId: string) => {
        transformersMockState.modelModelId = modelId;
        return model;
      }),
    },
  };
});

describe("WebLLMService.web", () => {
  beforeEach(async () => {
    mockState.payloads.length = 0;
    mockState.engineCalls = 0;
    mockState.lastModelId = "";
    mockState.initOptions = undefined;
    transformersMockState.modelModelId = "";
    transformersMockState.tokenizerModelId = "";
    await webLLMService.reset();
  });

  it("forwards messages as-is and options without injecting system prompts", async () => {
    const response = await webLLMService.completeChat(
      [
        {
          role: "system",
          content: "SYS_PROMPT",
        },
        {
          role: "user",
          content: "Salut !",
        },
      ],
      {
        temperature: 0.5,
        maxTokens: 128,
      },
    );

    expect(response.text).toBe("Bonjour !");
    expect(mockState.engineCalls).toBe(1);
    expect(mockState.lastModelId).toBe(DEFAULT_MODEL_ID);
    expect(mockState.payloads).toHaveLength(1);

    const payload = mockState.payloads[0];
    expect(payload.temperature).toBe(0.5);
    expect(payload.max_tokens).toBe(128);
    expect(payload.stream).toBe(false);
    expect(payload.messages[0]).toEqual({
      role: "system",
      content: "SYS_PROMPT",
    });
    expect(payload.messages[1]).toEqual({
      role: "user",
      content: "Salut !",
    });
  });

  it("switches to Transformers backend for Liquid LFM2 ONNX models", async () => {
    await webLLMService.init({ modelId: "onnx-community/LFM2-350M-ONNX" });

    const response = await webLLMService.completeChat(
      [{ role: "user", content: "Ping" }],
      { temperature: 0.3, maxTokens: 64 },
    );

    expect(response.text).toBe("Réponse Liquid");
    expect(transformersMockState.tokenizerModelId).toBe(
      "onnx-community/LFM2-350M-ONNX",
    );
    expect(transformersMockState.modelModelId).toBe(
      "onnx-community/LFM2-350M-ONNX",
    );
    expect(mockState.engineCalls).toBe(0);
  });

  it("rebuilds MLC engine when model id changes", async () => {
    await webLLMService.init({ modelId: "Llama-3.2-1B-Instruct-q4f32_1-MLC" });
    await webLLMService.init({ modelId: "Llama-3.2-3B-Instruct-q4f16_1-MLC" });

    expect(mockState.engineCalls).toBe(2);
    expect(mockState.lastModelId).toBe("Llama-3.2-3B-Instruct-q4f16_1-MLC");
  });

  it("returns an MLCEngine-compatible adapter for transformers models", async () => {
    await webLLMService.init({ modelId: "onnx-community/LFM2-700M-ONNX" });
    const engine = await webLLMService.getCurrentEngine();

    expect(engine).toBeTruthy();
    expect(typeof (engine as any)?.chat?.completions?.create).toBe("function");

    const response = await (engine as any).chat.completions.create({
      messages: [{ role: "user", content: "Salut" }],
      temperature: 0.4,
      max_tokens: 32,
      stream: false,
    });
    expect(response?.choices?.[0]?.message?.content).toBe("Réponse Liquid");
  });
});
