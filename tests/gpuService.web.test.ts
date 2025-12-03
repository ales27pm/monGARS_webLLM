import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectGpuMode } from '@/services/GpuService.web';

const originalNavigator = globalThis.navigator;

const resetNavigator = () => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: false,
    });
  } else {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    delete globalThis.navigator;
  }
};

afterEach(() => {
  resetNavigator();
  vi.restoreAllMocks();
});

describe('detectGpuMode', () => {
  it('returns webgpu when navigator.gpu provides an adapter', async () => {
    const requestAdapter = vi.fn().mockResolvedValue({ name: 'mock-adapter' });
    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: { requestAdapter } },
      configurable: true,
    });

    const mode = await detectGpuMode();

    expect(mode).toBe('webgpu');
    expect(requestAdapter).toHaveBeenCalled();
  });

  it('falls back to webgl2 when WebGPU is missing but WebGL2 succeeds', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });

    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation(() => {
        return {
          getContext: (type: string) => (type === 'webgl2' ? {} : null),
        } as unknown as HTMLCanvasElement;
      });

    const mode = await detectGpuMode();

    expect(mode).toBe('webgl2');
    expect(createElementSpy).toHaveBeenCalled();
  });

  it('returns none when neither WebGPU nor WebGL are available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    });

    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return {
        getContext: () => null,
      } as unknown as HTMLCanvasElement;
    });

    const mode = await detectGpuMode();

    expect(mode).toBe('none');
  });
});
