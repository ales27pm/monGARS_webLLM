import { ModelConfig, InitProgressReport } from '../types';

export class LlmService {
    private engine: any = null;
    private loadPromise: Promise<void> | null = null;
    private webllm: any = null;

    async checkWebGPUSupport(): Promise<boolean> {
        if (!(navigator as any).gpu) return false;
        try {
            const adapter = await (navigator as any).gpu.requestAdapter();
            return !!adapter;
        } catch (e) {
            return false;
        }
    }

    async loadLibrary(): Promise<void> {
        if (this.webllm) return Promise.resolve();
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            // Updated to 0.2.80 as requested
            const version = '0.2.80';
            
            // Strategy 1: JSDelivr ESM (Primary)
            try {
                const module = await import(`https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${version}/+esm`);
                this.webllm = module;
                window.webllm = module;
                console.log('WebLLM library loaded via JSDelivr');
                return;
            } catch (e) {
                console.warn('JSDelivr ESM load failed, trying fallback...', e);
            }

            // Strategy 2: esm.sh (Fallback)
            try {
                const module = await import(`https://esm.sh/@mlc-ai/web-llm@${version}`);
                this.webllm = module;
                window.webllm = module;
                console.log('WebLLM library loaded via esm.sh');
                return;
            } catch (e) {
                console.warn('esm.sh load failed', e);
            }

            this.loadPromise = null;
            throw new Error('Failed to download WebLLM library. Please check your internet connection or firewall settings.');
        })();

        return this.loadPromise;
    }

    async initializeEngine(
        model: ModelConfig, 
        progressCallback: (report: InitProgressReport) => void,
        signal?: AbortSignal
    ) {
        // Ensure library is loaded
        if (!this.webllm) {
            await this.loadLibrary();
        }

        const appConfig = {
            model_list: [
                {
                    model: model.modelUrl,
                    model_id: model.id,
                    model_lib: model.modelLibUrl,
                    required_features: ["shader-f16"],
                }
            ],
            useIndexedDBCache: true,
            initProgressCallback: (report: any) => {
                progressCallback({
                    text: report.text,
                    progress: Math.round(report.progress * 100)
                });
            }
        };

        try {
            if (this.engine) {
                console.log('Reloading engine with model:', model.id);
                // Optional: Explicitly unload if necessary, but CreateMLCEngine handles it
            }

            // Use the loaded module instance directly
            this.engine = await this.webllm.CreateMLCEngine(model.id, {
                appConfig,
                signal
            });
            return this.engine;
        } catch (error: any) {
            console.error("Engine initialization error:", error);
            // Check for specific WASM download errors
            if (error.message && (error.message.includes("404") || error.message.includes("Network response"))) {
                console.error(`Failed to download WASM binary from: ${model.modelLibUrl}`);
            }
            throw error;
        }
    }

    async generateCompletion(
        messages: { role: string; content: string }[],
        signal?: AbortSignal
    ): Promise<string> {
        if (!this.engine) throw new Error('Engine not initialized');

        const completion = await this.engine.chat.completions.create({
            messages,
            stream: false, 
            temperature: 0.7,
            max_tokens: 1024
        }, { signal });

        return completion.choices[0]?.message?.content || "";
    }

    async getEngine() {
        return this.engine;
    }
}

export const llmService = new LlmService();