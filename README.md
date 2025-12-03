# Mon Gars – WebLLM Assistant

Mon Gars is a privacy-first AI chat experience that runs fully in the browser using WebLLM. The multi-screen React UI (Home, Voix, Réglages, Raisonnement, Capacités) is optimized for WebGPU when available and gracefully falls back to WebGL/CPU on other browsers. A shared brain layer orchestrates conversation flow so the same services can power the Tauri desktop shell.

## Prérequis
- Node.js 18 ou plus récent
- npm 9+
- Navigateur moderne (WebGPU recommandé mais non obligatoire)

## Installation
```bash
npm install
```

## Lancer le développement
La configuration Vite démarre un serveur HTTPS (port 3000) pour activer WebGPU et les API de contexte sécurisé :

```bash
npm run dev
```

Ouvrez `https://localhost:3000` et acceptez le certificat autosigné généré par Vite si besoin.

## Tests
Les suites Vitest fonctionnent en environnement jsdom et mockent WebLLM/WebGPU :

```bash
npm test -- --watch=false
```

## Build de production
Générez les assets statiques optimisés et servez-les en local :

```bash
npm run build
npm run preview
```

Pour un hébergement statique (NGINX, CDN…), déployez simplement le contenu du dossier `dist/` sans backend supplémentaire. Le bundle est découpé (vendor/react) pour de meilleurs caches longue durée.

Pour la coque desktop Tauri, générez d’abord les icônes à partir de leurs sources Base64 puis lancez la build empaquetée :

```bash
npm run tauri:prepare
cd src-tauri && cargo tauri build
```

Pour des instructions détaillées de packaging (static hosting et Tauri desktop), consultez [ARCHITECTURE.md](./ARCHITECTURE.md) et [DEPLOY.md](./DEPLOY.md).

## Points clés de l’architecture
- **Entrée web** : `index.tsx` monte `src/App.tsx` qui encapsule le routeur à onglets et le `ChatProvider`.
- **Brain** : `src/brain/MonGarsBrainService.ts` gère l’état de conversation, applique le prompt système, séquence les appels WebLLM et expose un snapshot via `useMonGarsBrain` / `ChatContext`.
- **Services** : `src/services/WebLLMService.*` (Web/Native) encapsulent l’initialisation `@mlc-ai/web-llm`, tandis que `src/services/GpuService.*` détectent WebGPU → WebGL → aucun.
- **UI** : `src/screens/` et `src/components/` consomment uniquement le `ChatContext` pour l’historique, le statut de génération, le raisonnement et l’état vocal.
- **Desktop** : `src-tauri/tauri.conf.json` empaquette le bundle Vite avec une CSP locale stricte, sans accès distant par défaut.

## Licences et responsabilités
Ce projet est fourni tel quel pour un usage de recherche et d’assistant local. Vérifiez les licences des dépendances dans `package.json` et adaptez la configuration à vos contraintes réglementaires.
