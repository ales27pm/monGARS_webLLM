# monGARS WebLLM Platform Architecture

## Final Architecture Decision
- **Authoritative web React root:** `src/App.tsx` compiled via `index.tsx` to keep Vite/Tauri static builds; legacy `App.tsx` remains as an optional legacy entry behind a feature flag during transition.
- **Folders by layer (web/Tauri):**
  - **Brain:** `contextEngine.ts`, `decisionEngine.ts`, `reasoning*.ts`, `memory*.ts`, `speechPipeline.ts` + hooks under repository root; shared service adapters under `src/services/` (WebLLM, GPU, speech adapters as added) and `src/context/` for platform-neutral state management.
  - **Services:** `src/services/` (WebLLM/GPU/platform bridges), `src/context/ChatContext.tsx` (state + Chat API surface), `models.ts` for model registry, `types.ts` for shared DTOs.
  - **UI:** `src/screens/` (multi-screen navigation), `src/components/` (RN-style primitives), `index.html`/`index.tsx` bootstrap, plus legacy UI under `components/` and root-level `App.tsx` preserved during migration.

## Platform Boundary Strategy
- **Web (Vite + static hosting):** Use `index.tsx` to mount `src/App.tsx` as the primary UI. Legacy `App.tsx` stays available behind a build-time flag or alternate entry for debugging. WebLLM runs in-browser via `@mlc-ai/web-llm`; GPU detection via `GpuService.web.ts`; speech features rely on `speechPipeline.ts` with browser audio APIs.
- **Desktop (Tauri):** Wrap the Vite build without altering the web bundle. Tauri shell supplies filesystem/window integration only; the React root and services mirror web behavior. GPU/service selection continues to favor WebGPU/WebGL inside the Tauri WebView; native modules are avoided to keep parity with web.
- **Future mobile/TV/CarPlay:** Treat `src/` as the shared, platform-neutral UI/services package. React Native projects import `src/services/*` and `src/context/ChatContext.tsx` for the brain/chat API. Platform-specific screens/components live in their own repos but mirror navigation structure; web keeps parity by reusing the same screens styled for the browser.

## Layer Boundaries
- **Brain layer:** WebLLM orchestration (`src/services/WebLLMService.*`, `models.ts`), context/reasoning (`contextEngine.ts`, `decisionEngine.ts`, `reasoning*.ts`), memory (`memory*.ts`, `embedding.worker.ts`), speech (`speechPipeline.ts`, `useSpeech.ts`, `useVoiceConversationLoop.ts`), GPU detection (`src/services/GpuService.*`). These modules avoid UI imports and expose typed functions/events.
- **Chat API layer:** `src/context/ChatContext.tsx` exposes a typed provider/hook (`useChat`) offering `sendMessage`, `startVoiceSession`, `loadModel`, status flags, and emitted reasoning/memory traces. It depends on the Brain layer only and is the single surface consumed by UI components across platforms.
- **UI layer:** Navigation and visual components in `src/screens/` and `src/components/` consume the Chat API. Platform-specific theming/layout lives here. Legacy UI (`App.tsx`, `components/`) is isolated and shims into the Chat API for shared behaviors.

## Migration Plan (≤10 steps)
1. **Select root:** Point `index.tsx` to render `src/App.tsx` as default; keep a `legacy` entry path for `App.tsx` during overlap.
2. **Chat API unification:** Expand `src/context/ChatContext.tsx` to wrap existing brain modules (context, memory, speech) and export stable methods for chat/voice actions.
3. **Service consolidation:** Move WebLLM and GPU adapters into `src/services/` as single sources of truth; ensure legacy code consumes them through a thin shim.
4. **Legacy shim:** Add a compatibility hook/provider so legacy `App.tsx` reads/writes via the Chat API instead of direct engine calls.
5. **UI alignment:** Port legacy UI pieces incrementally into `src/components/`/`src/screens/`, ensuring feature parity (reasoning view, memory hits, speech status).
6. **Config typing:** Centralize model/config/constants into shared typed modules (`models.ts`, `types.ts`, `constants.ts`), imported by both stacks.
7. **Speech/memory isolation:** Decouple speech and memory hooks from DOM concerns; expose them as platform-neutral services with platform-specific adapters as needed.
8. **Build targets:** Update Vite config to support dual entries or flags (`legacy` vs `modern`) and validate static `vite build`; ensure Tauri consumes the modern bundle.
9. **Testing pass:** Add integration tests for Chat API + services; verify lint/prettier and unit tests; smoke-test web/Tauri builds.
10. **Deprecate legacy entry:** Remove the legacy path once parity is verified; document the final structure for future mobile reuse.

## Notes
- Keep WebLLM initialization untouched while refactoring (service wrappers only). Maintain context budgeting and semantic memory scoring behaviors. Preserve speech pipeline fallbacks (WebGPU → CPU/whisper) and GPU detection heuristics.
