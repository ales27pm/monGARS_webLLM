# Mon Gars – WebLLM Assistant

Mon Gars is a browser-based AI assistant that runs fully on-device using WebLLM. It ships with a French-first system prompt, WebGPU acceleration, semantic memory, and a lightweight search pipeline powered by DuckDuckGo to keep answers grounded.

## Features
- **Private by default** – runs in the browser with WebLLM; no server required.
- **WebGPU optimized** – HTTPS dev server enables GPU execution where available, with graceful fallbacks when WebGPU is missing.
- **Grounded reasoning** – optional web search and reasoning traces to show how answers are produced.
- **Semantic memory** – recall earlier context to maintain conversation quality.
- **Customizable** – tweak the model, temperature, max tokens, and system prompt from the UI.

## Prerequisites
- Node.js 18 or newer
- npm 9+ (ships with recent Node releases)
- A modern Chromium-based browser with WebGPU for best performance (the app will still work without WebGPU, but may run slower).

## Installation
1. Install dependencies:
   ```bash
   npm install
   ```

2. (Optional) Create a `.env.local` file if you want to expose a Gemini API key to the client (used by parts of the UI that expect `process.env.GEMINI_API_KEY`).
   ```bash
   echo "GEMINI_API_KEY=your_key_here" > .env.local
   ```

## Development
Run the HTTPS dev server (required for WebGPU and other secure-context APIs):
```bash
npm run dev
```

The app will be available at `https://localhost:3000`. Vite’s self-signed certificate is generated automatically by the `@vitejs/plugin-basic-ssl` plugin; trust it in your browser if prompted.

## Production build
Generate an optimized build and preview it locally:
```bash
npm run build
npm run preview
```

## Troubleshooting
- **WebGPU not detected:** make sure you are using a browser with WebGPU enabled and you access the app over HTTPS. The UI falls back gracefully but performance may degrade.
- **Missing dependencies:** rerun `npm install` if imports such as `zod` cannot be resolved.
- **Environment variables:** Vite exposes values from `.env*` files at build time. Restart the dev server after changing them.

## Project structure
Key entry points:
- `App.tsx` – main React application with chat orchestration, settings, and search integration.
- `components/` – UI building blocks (chat container, header, status bar, etc.).
- `contextEngine.ts`, `reasoning.ts` – logic for contextualization and reasoning traces.
- `vite.config.ts` – HTTPS-enabled Vite configuration with environment variable injection.

## License
This project is provided as-is under its repository license. Review `LICENSE` (if present) for details.
