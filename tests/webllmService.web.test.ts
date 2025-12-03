import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webLLMService } from '@/services/WebLLMService';
import { DEFAULT_MODEL_ID } from '../models';

const mockState = {
  payloads: [] as any[],
  engineCalls: 0,
  lastModelId: '',
  initOptions: undefined as unknown,
};

vi.mock('@mlc-ai/web-llm', () => {
  const mockEngine = {
    chat: {
      completions: {
        create: vi.fn(async (payload: any) => {
          mockState.payloads.push(payload);
          return {
            choices: [
              {
                message: {
                  content: 'Bonjour !',
                },
              },
            ],
          };
        }),
      },
    },
    runtimeStatsText: vi.fn(async () => 'stats'),
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

describe('WebLLMService.web', () => {
  beforeEach(async () => {
    mockState.payloads.length = 0;
    mockState.engineCalls = 0;
    mockState.lastModelId = '';
    mockState.initOptions = undefined;
    await webLLMService.reset();
  });

  it('builds a payload with system prompt and forwards options', async () => {
    const response = await webLLMService.completeChat(
      [
        {
          role: 'user',
          content: 'Salut !',
        },
      ],
      {
        temperature: 0.5,
        maxTokens: 128,
        systemPrompt: 'SYS_PROMPT',
      },
    );

    expect(response.text).toBe('Bonjour !');
    expect(mockState.engineCalls).toBe(1);
    expect(mockState.lastModelId).toBe(DEFAULT_MODEL_ID);
    expect(mockState.payloads).toHaveLength(1);

    const payload = mockState.payloads[0];
    expect(payload.temperature).toBe(0.5);
    expect(payload.max_tokens).toBe(128);
    expect(payload.stream).toBe(false);
    expect(payload.messages[0]).toEqual({
      role: 'system',
      content: 'SYS_PROMPT',
    });
    expect(payload.messages[1]).toEqual({
      role: 'user',
      content: 'Salut !',
    });
  });
});
