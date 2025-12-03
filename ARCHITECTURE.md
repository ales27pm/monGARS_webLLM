# Architecture

This document describes how the production Mon Gars web + desktop experience is structured after the recent refactors. It maps the brain/services/UI boundaries, explains how WebLLM and GPU detection are wired, and notes how the Tauri shell packages the static web build.

## High-level overview
- **Entrée unique :** `index.tsx` monte `src/App.tsx`, une UI à onglets (Home / Voix / Réglages / Raisonnement / Capacités) enveloppée par `ChatProvider` pour exposer l’API de conversation.
- **Brain partagé :** `src/brain/MonGarsBrainService.ts` maintient l’historique, applique le prompt système, protège les envois concurrents et orchestre WebLLM via `webLLMService`. Le hook `src/brain/useMonGarsBrain.ts` publie un snapshot immutable vers React.
- **Services :** `src/services/WebLLMService.*` encapsulent l’initialisation `@mlc-ai/web-llm` (Web et Native) et exposent `completeChat`. `src/services/GpuService.*` détectent WebGPU puis WebGL avant de basculer en mode logiciel.
- **UI :** Les écrans dans `src/screens/` et les composants dans `src/components/` consomment uniquement `ChatContext` (`src/context/ChatContext.tsx`) pour afficher les messages, traces de raisonnement, états vocaux et capacités GPU.

## Data flow & brain surface
1. `ChatContext` lit le snapshot du brain via `useMonGarsBrain` et expose une API réduite (`sendMessage`, `resetConversation`, flags de génération/vocal, traces de raisonnement, stats mémoire).
2. `sendMessage` délègue à `MonGarsBrainService.sendUserMessage`, qui :
   - Nettoie l’entrée utilisateur (`sanitizeUserInput`).
   - Empile le message utilisateur dans l’historique interne.
   - Appelle `webLLMService.completeChat` avec le prompt système Mon Gars, `temperature` 0.7 et `maxTokens` 256.
   - Écrit la réponse de l’assistant (ou une erreur structurée) et diffuse un snapshot aux abonnés.
3. Les écrans s’abonnent via `useChatContext` pour rendre l’historique, les traces minimales de raisonnement et l’état vocal/mémoire stubs (extensibles sans modifier le contrat UI).

## WebLLM wiring
- Le service web (`src/services/WebLLMService.web.ts`) met en cache l’appel `CreateMLCEngine` de `@mlc-ai/web-llm` pour éviter les initialisations multiples. Il convertit les messages du brain en `ChatCompletionMessageParam` et renvoie soit `text`, soit un flux `stream` selon l’option demandée.
- `WebLLMService.ts` choisit la bonne implémentation (web ou native) et normalise la signature `completeChat(history, { temperature, maxTokens, systemPrompt })` afin que le brain n’ait pas à connaître la plateforme.

## GPU detection and fallbacks
- `detectGpuMode` (web) essaie `navigator.gpu.requestAdapter()` puis tombe sur une création de contexte `webgl2`, puis `webgl`, sinon `none`. La version native fournit les mêmes modes exposés via `GpuMode`.
- Les écrans lisent `gpuMode` pour ajuster les visuels : WebGPU active les visualisations complètes, WebGL bascule en chemin simplifié, et `none` affiche des messages explicites de repli logiciel.

## Tauri desktop shell
- `src-tauri/tauri.conf.json` pointe `dist/` comme frontend, lance `npm run build` avant le bundling, et interdit le contenu distant (`allowlist.all = false`, `dangerousRemoteDomainIpcAccess = []`).
- La CSP force les ressources locales uniquement : `default-src 'self'; connect-src 'self'; ... worker-src 'self' blob:` pour autoriser les workers WebLLM sans ouvrir de domaines externes.
- La fenêtre desktop charge uniquement les assets packagés, sans origines alternatives.

## Tests & health checks
- Vitest (`npm test`) couvre :
  - Construction du payload WebLLM côté web (`tests/webllmService.web.test.ts`).
  - Détection GPU et repli WebGL/logiciel (`tests/gpuService.web.test.ts`).
  - Sanitation des entrées utilisateur du brain (`tests/brainUtils.test.ts`).
- `npm run build` valide le bundle Vite/React pour le web et pour l’emballage Tauri.

## Production Checklist
- [ ] Build : `npm run build`
- [ ] Tests : `npm test -- --watch=false`
- [ ] GPU : WebGPU détecté sur navigateurs compatibles, repli WebGL/logiciel actif ailleurs
- [ ] Desktop : `pnpm tauri build` (ou `npm run tauri build` avec l’outil Tauri installé) et CSP/capabilities verrouillées sur ressources locales
