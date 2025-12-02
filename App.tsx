import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { z } from "zod";

let webLLMModulePromise: Promise<any> | null = null;
async function getWebLLM() {
  if (!webLLMModulePromise) {
    // Use the official browser ESM build of WebLLM.
    webLLMModulePromise = import("https://esm.run/@mlc-ai/web-llm@0.2.80");
  }
  return webLLMModulePromise;
}

import { Header } from "./components/Header";
import { ChatContainer } from "./components/ChatContainer";
import { InputBar } from "./components/InputBar";
import { StatusBar } from "./components/StatusBar";
import { SettingsModal } from "./components/SettingsModal";
import { EmptyState } from "./components/EmptyState";
import { ToastContainer } from "./components/ToastContainer";
import { SearchIndicator } from "./components/SearchIndicator";
import { ReasoningVisualizer } from "./components/ReasoningVisualizer";
import { CapabilityPills } from "./components/CapabilityPills";
import { HeroHeader } from "./components/HeroHeader";
import type {
  Message,
  Config,
  EngineStatus,
  ToastInfo,
  InitProgressReport,
  MLCEngine,
} from "./types";
import { useSemanticMemory as useSemanticMemoryHook } from "./useSemanticMemory";
import { decideNextAction, MODEL_ID } from "./decisionEngine";
import { getModelShortLabel } from "./models";
import type { ScoredMemoryEntry } from "./memory";
import { buildContext } from "./contextEngine";

declare global {
  interface Navigator {
    gpu?: any;
  }
}

type Source = { title: string; url: string };

type ReasoningTrace = {
  id: number;
  requestedAction: "search" | "respond";
  effectiveAction: "search" | "respond";
  query?: string | null;
  plan: string;
  rationale?: string;
  memoryContext: string;
  memoryEnabled: boolean;
  memoryResults: ScoredMemoryEntry[];
  timestamp: number;
};

const DEFAULT_SEARCH_API_BASE = "https://api.duckduckgo.com/";

const normalizeSearchApiBase = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_SEARCH_API_BASE;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_SEARCH_API_BASE;
    }

    const normalizedPath = url.pathname.endsWith("/")
      ? url.pathname
      : `${url.pathname}/`;

    return `${url.origin}${normalizedPath}`;
  } catch {
    return DEFAULT_SEARCH_API_BASE;
  }
};

const getBooleanSetting = (key: string, fallback: boolean) => {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
};

const getNumberSetting = (key: string, fallback: number) => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const App: React.FC = () => {
  const [engine, setEngine] = useState<MLCEngine | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isReloadingRef = useRef(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("idle");
  const [initProgress, setInitProgress] = useState<InitProgressReport>({
    progress: 0,
    text: "En attente...",
  });
  const [performanceStats, setPerformanceStats] = useState({
    tps: "-",
    memory: "-",
    contextTokens: 0,
  });
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [reasoningTrace, setReasoningTrace] = useState<ReasoningTrace | null>(
    null,
  );
  const [webGPUAvailable, setWebGPUAvailable] = useState<boolean | undefined>(
    undefined,
  );

  const timestampSchema = z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? Date.now() : parsed;
    }

    return Date.now();
  }, z.number());

  const messageSchema = z.object({
    id: z.string(),
    role: z.enum(["assistant", "tool", "user"]).catch("user"),
    content: z
      .union([z.string(), z.null()])
      .transform((value) => (typeof value === "string" ? value : "")),
    timestamp: timestampSchema,
    tokens: z.preprocess(
      (value) =>
        typeof value === "number" && Number.isFinite(value) ? value : undefined,
      z.number().optional(),
    ),
  });

  const initialConfig = useMemo<Config>(
    () => ({
      modelId: localStorage.getItem("mg_model") || MODEL_ID,
      systemPrompt:
        localStorage.getItem("mg_system") ||
        `Tu es "Mon Gars", un assistant IA français utile, direct et pragmatique. Tu expliques clairement, étape par étape, sans jargon inutile.

Règles :
- Tu réponds toujours en FRANÇAIS.
- Tu gardes les réponses courtes et efficaces par défaut.
- Tu peux détailler davantage si l'utilisateur le demande.
- Si l'utilisateur te demande du code, tu fournis du code COMPLET et fonctionnel avec les commandes d'installation et d'exécution.
- Tu disposes d'un outil de recherche web : ne prétends jamais être sans Internet sauf si une erreur réseau est détectée.
- Tu n'inventes jamais de sources ou de liens : cite uniquement des références réelles ou indique clairement qu'aucune source fiable n'est disponible.
- Ne fais jamais semblant d'avoir exécuté du code ou des commandes, dis-le simplement.
- Utilise un ton amical mais professionnel.`,
      temperature: parseFloat(localStorage.getItem("mg_temp") || "0.7"),
      maxTokens: parseInt(localStorage.getItem("mg_max_tokens") || "512"),
      theme:
        (localStorage.getItem("mg_theme") as "light" | "dark" | null) || "dark",
      semanticMemoryEnabled: getBooleanSetting(
        "mg_semantic_memory_enabled",
        true,
      ),
      semanticMemoryMaxEntries: getNumberSetting("mg_semantic_max_entries", 96),
      semanticMemoryNeighbors: getNumberSetting("mg_semantic_neighbors", 4),
      toolSearchEnabled: getBooleanSetting("mg_tool_search_enabled", true),
      searchApiBase:
        localStorage.getItem("mg_search_api_base") ||
        "https://api.duckduckgo.com",
    }),
    [],
  );

  const [config, setConfig] = useState<Config>(initialConfig);

  const { queryMemory, recordExchange } = useSemanticMemoryHook(messages, {
    enabled: config.semanticMemoryEnabled,
    maxEntries: config.semanticMemoryMaxEntries,
    neighbors: config.semanticMemoryNeighbors,
  });

  const semanticMemoryClient = useMemo(
    () => ({
      enabled: config.semanticMemoryEnabled,
      search: (query: string, neighbors: number) => queryMemory(query, neighbors),
    }),
    [config.semanticMemoryEnabled, queryMemory],
  );

  const lastAssistantMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === "assistant") {
        return messages[i].content;
      }
    }
    return undefined;
  })();

  const addToast = useCallback(
    (
      title: string,
      message: string,
      type: "info" | "success" | "warning" | "error" = "info",
    ) => {
      const id = Date.now();
      setToasts((prev) => [...prev, { id, title, message, type }]);
    },
    [],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", config.theme === "dark");
  }, [config.theme]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("mg_conversation_default");
      if (stored) {
        const parsed = JSON.parse(stored);
        const parsedArray = z.array(z.unknown()).safeParse(parsed);

        if (parsedArray.success) {
          const sanitized = parsedArray.data.reduce<Message[]>((acc, item) => {
            const result = messageSchema.safeParse(item);
            if (result.success) {
              acc.push(result.data);
            }
            return acc;
          }, []);

          if (sanitized.length === 0 && parsedArray.data.length > 0) {
            localStorage.removeItem("mg_conversation_default");
            addToast(
              "Conversation réinitialisée",
              "Les données stockées étaient invalides et ont été effacées.",
              "warning",
            );
          }

          setMessages(sanitized);
        } else {
          localStorage.removeItem("mg_conversation_default");
          setMessages([]);
          addToast(
            "Conversation réinitialisée",
            "Les données stockées étaient invalides et ont été effacées.",
            "warning",
          );
        }
      }
    } catch (e) {
      addToast("Erreur", "Impossible de charger la conversation.", "error");
    }
  }, [addToast]);

  const saveConversation = (currentMessages: Message[]) => {
    try {
      localStorage.setItem(
        "mg_conversation_default",
        JSON.stringify(currentMessages),
      );
    } catch {
      // best-effort
    }
  };

  /**
   * Check for WebGPU availability. Safari and some browsers expose
   * `navigator.gpu` but still return `null` from `navigator.gpu.requestAdapter()`
   * when no compatible GPU adapter is available or the page is served over an
   * insecure context. To avoid errors from the WebLLM runtime, we probe
   * `navigator.gpu.requestAdapter()` and only proceed if it resolves to a
   * non‐null adapter. The function returns a promise because probing the
   * adapter is asynchronous.
   */
  const checkWebGPU = useCallback(async () => {
    // If the API is completely missing, bail out immediately.
    if (!navigator.gpu) {
      addToast(
        "WebGPU non supporté",
        "Utilise un navigateur compatible comme Chrome/Edge 113+ ou un appareil avec WebGPU activé.",
        "error",
      );
      setEngineStatus("error");
      setInitProgress({ progress: 0, text: "WebGPU non disponible" });
      setWebGPUAvailable(false);
      return false;
    }
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        // Adapter is null: either GPU is disabled/blocked or insecure context.
        addToast(
          "WebGPU non disponible",
          "Impossible d’obtenir un adaptateur GPU. Vérifie que l’accélération matérielle est activée et que la page est servie via HTTPS ou localhost.",
          "error",
        );
        setEngineStatus("error");
        setInitProgress({ progress: 0, text: "WebGPU non disponible" });
        setWebGPUAvailable(false);
        return false;
      }
    } catch (err) {
      // In case requestAdapter() itself rejects, treat as unsupported.
      console.warn("Error while probing WebGPU:", err);
      addToast(
        "WebGPU non disponible",
        "Une erreur est survenue lors de la détection de WebGPU. Vérifie la configuration de ton navigateur.",
        "error",
      );
      setEngineStatus("error");
      setInitProgress({ progress: 0, text: "WebGPU non disponible" });
      setWebGPUAvailable(false);
      return false;
    }
    setWebGPUAvailable(true);
    return true;
  }, [addToast, setWebGPUAvailable]);

  useEffect(() => {
    let cancelled = false;
    const probeWebGPU = async () => {
      const available = await checkWebGPU();
      if (!cancelled) {
        setWebGPUAvailable(available);
      }
    };
    probeWebGPU();
    return () => {
      cancelled = true;
    };
  }, [checkWebGPU]);

  const loadEngine = useCallback(
    async (forceReload = false): Promise<MLCEngine | null> => {
      if (isReloadingRef.current) return engine;

      const existingEngine = engine;
      if (existingEngine && !forceReload) return existingEngine;

      // Wait for WebGPU support check. If unsupported, abort loading.
      if (!(await checkWebGPU())) return null;

      isReloadingRef.current = true;
      setEngineStatus("loading");
      setInitProgress({ progress: 0, text: "Initialisation du moteur..." });

      try {
        const selectedModel = config.modelId;

        const webllm = await getWebLLM();
        const CreateMLCEngineFn = (webllm as any).CreateMLCEngine as (
          modelId: string,
          options: {
            initProgressCallback?: (report: InitProgressReport) => void;
            appConfig?: any;
          },
        ) => Promise<any>;

        // Ask WebLLM to create the engine for the selected model.  We do not
        // provide a custom `appConfig` here. When the model ID corresponds to
        // one of the officially supported models (including Qwen2.5), WebLLM
        // automatically fetches the appropriate WASM runtime and model files.
        const newEngine = (await CreateMLCEngineFn(selectedModel, {
          initProgressCallback: (report: InitProgressReport) => {
            setInitProgress({
              progress: Math.round(report.progress * 100),
              text: report.text,
            });
          },
          // Note: No `appConfig` is passed. Passing an incorrect
          // configuration can lead to cryptic errors (e.g. reading
          // `.endsWith` on undefined). Let the runtime infer the correct
          // configuration based on `selectedModel`.
        })) as MLCEngine;

        setEngine(newEngine);
        setEngineStatus("ready");

        addToast(
          "Moteur chargé",
          `Modèle ${getModelShortLabel(selectedModel)} prêt.`,
          "success",
        );

        setMessages((prev) => {
          if (prev.length > 0) return prev;
          const welcomeMessage: Message = {
            id: `msg-${Date.now()}`,
            role: "assistant",
            content:
              `Salut ! Je suis **Mon Gars**, ton assistant IA local.\n\n` +
              `Je fonctionne entièrement *sur ton appareil* grâce à WebGPU : rien ne quitte ton téléphone.\n\n` +
              `Pose-moi une question, ou demande-moi d'expliquer quelque chose.`,
            timestamp: Date.now(),
          };
          return [welcomeMessage];
        });

        return newEngine;
      } catch (err: any) {
        console.error("Engine loading error:", err);
        setEngineStatus("error");
        setInitProgress({
          progress: 0,
          text: `Erreur: ${err?.message || "Impossible d'initialiser le moteur"}`,
        });
        addToast(
          "Erreur de chargement",
          err?.message ||
            "Impossible d'initialiser l'IA. Vérifie ta connexion et réessaie.",
          "error",
        );
        return null;
      } finally {
        isReloadingRef.current = false;
      }
    },
    [addToast, checkWebGPU, config.modelId, engine],
  );

  const handleEngineError = useCallback(
    async (err: any) => {
      const message = err?.message || String(err);
      if (/disposed/i.test(message)) {
        console.warn("WebLLM engine disposed, attempting recovery", err);
        setEngineStatus("error");
        setInitProgress({
          progress: 0,
          text: "Moteur WebGPU relancé après une erreur interne.",
        });
        setEngine(null);
        addToast(
          "Redémarrage du moteur",
          "Le moteur a été réinitialisé après une erreur WebGPU. Nouvelle tentative en cours...",
          "warning",
        );
        try {
          const newEngine = await loadEngine(true);
          if (newEngine) {
            return true;
          }
          console.error(
            "Engine recovery failed: loadEngine did not initialize a new engine",
          );
        } catch (loadErr) {
          console.error("Engine recovery failed during loadEngine:", loadErr);
        }
        return false;
      }
      return false;
    },
    [addToast, loadEngine],
  );

  useEffect(() => {
    let statsInterval: ReturnType<typeof setInterval>;

    const updateStats = async () => {
      if (!engine) return;
      try {
        const statsText = await engine.runtimeStatsText();
        const decodeRateMatch = statsText.match(/decode:\s*([\d.]+)\s*tok\/s/);
        const memoryMatch = statsText.match(
          /estimated VRAM usage:\s*([\d.]+)\s*MB/,
        );
        const contextTokensMatch = statsText.match(/context tokens:\s*(\d+)/);

        setPerformanceStats({
          tps:
            isGenerating && decodeRateMatch
              ? parseFloat(decodeRateMatch[1]).toFixed(1)
              : "-",
          memory: memoryMatch ? parseFloat(memoryMatch[1]).toFixed(0) : "-",
          contextTokens: contextTokensMatch
            ? parseInt(contextTokensMatch[1], 10)
            : 0,
        });
      } catch {
        // ignore stats errors
      }
    };

    if (isGenerating && engine) {
      statsInterval = setInterval(updateStats, 1000);
    } else if (engineStatus === "ready" && engine) {
      updateStats();
    }

    return () => {
      if (statsInterval) clearInterval(statsInterval);
    };
  }, [isGenerating, engine, engineStatus]);

  const [sources, setSources] = useState<Source[]>([]);

  const addSource = (title: string, url: string) => {
    setSources((prev) => {
      if (prev.some((s) => s.url === url)) return prev;
      return [...prev, { title, url }];
    });
  };

  const clearConversation = useCallback(() => {
    setMessages([]);
    setSources([]);
    setReasoningTrace(null);
    localStorage.removeItem("mg_conversation_default");
    addToast(
      "Conversation réinitialisée",
      "Historique, sources et mémoire ont été effacés.",
      "info",
    );
  }, [addToast]);

  const performWebSearch = async (
    query: string,
    parentSignal?: AbortSignal | null,
  ): Promise<{ content: string; sources: Source[] }> => {
    if (!config.toolSearchEnabled) {
      return {
        content:
          "La recherche web est désactivée dans les paramètres. Réponds sans appel réseau.",
        sources: [],
      };
    }

    addToast("Recherche Web", `Recherche de "${query}"...`, "info");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const forwardAbort = () => controller.abort(parentSignal?.reason as any);

    if (parentSignal) {
      parentSignal.addEventListener("abort", forwardAbort);
    }

    try {
      const apiBase = config.searchApiBase || "https://api.duckduckgo.com";
      const rawUrl = `${apiBase}?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const proxiedUrl = rawUrl.startsWith("http")
        ? `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`
        : rawUrl;
      const response = await fetch(proxiedUrl, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Network response was not ok. Status: ${response.status}`,
        );
      }

      const results = await response.json();

      let content = "";
      const sources: Source[] = [];
      const seenUrls = new Set<string>();
      const MAX_RESULTS = 5;

      const addResult = (text: string, url: string) => {
        if (!seenUrls.has(url)) {
          seenUrls.add(url);
          sources.push({ title: text, url });
          addSource(text, url);
        }
      };

      if (results?.AbstractText && results?.AbstractURL) {
        content += `Résumé: ${results.AbstractText}\n\n`;
        addResult(results.AbstractText, results.AbstractURL);
      }

      const topics = results.RelatedTopics?.filter(
        (topic: any) => topic.Text && topic.FirstURL,
      );

      if (topics && topics.length > 0) {
        content += "Résultats:\n";
        topics.slice(0, MAX_RESULTS).forEach((res: any) => {
          content += `- ${res.Text}\n`;
          addResult(res.Text, res.FirstURL);
        });
      }

      if (!content && results.Results?.length > 0) {
        content += "Résultats:\n";
        results.Results.slice(0, MAX_RESULTS).forEach((res: any) => {
          if (res.Text && res.FirstURL) {
            content += `- ${res.Text}\n`;
            addResult(res.Text, res.FirstURL);
          }
        });
      }

      if (!content) {
        content = `Je n'ai pas trouvé de résultats clairs pour "${query}".`;
      }

      return { content, sources };
    } catch (error: any) {
      console.error("Web search error:", error);
      addToast(
        "Erreur de recherche",
        error?.name === "AbortError"
          ? "Recherche annulée (délai dépassé)."
          : error?.message || "La recherche web a échoué.",
        "error",
      );
      return {
        content:
          "La recherche web a échoué (problème de réseau ou de CORS). Réponds en te basant uniquement sur tes connaissances internes.",
        sources: [],
      };
    } finally {
      clearTimeout(timeout);
      if (parentSignal) {
        parentSignal.removeEventListener("abort", forwardAbort);
      }
    }
  };

  const streamAnswer = async (
    history: { role: string; content: string }[],
    aiPlaceholderId: string,
  ) => {
    if (!engine) {
      throw new Error("Moteur non initialisé");
    }

    const currentEngine = engine;

    const chunks = await currentEngine.chat.completions.create({
      messages: history,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      stream: true,
      signal: abortControllerRef.current?.signal,
    });

    let aiResponseStream = "";
    for await (const chunk of chunks) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (abortControllerRef.current?.signal.aborted) break;
      aiResponseStream += content;
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiPlaceholderId
            ? { ...msg, content: aiResponseStream }
            : msg,
        ),
      );
    }

    return aiResponseStream;
  };

  const handleSend = async (inputText: string) => {
    const currentEngine = engine;

    const trimmedInput = inputText.trim();

    if (trimmedInput === "/clear") {
      clearConversation();
      return;
    }

    if (!currentEngine || !trimmedInput || isGenerating) {
      if (!currentEngine)
        addToast(
          "Moteur non démarré",
          'Cliquez sur "Démarrer le moteur".',
          "warning",
        );
      return;
    }

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: trimmedInput,
      timestamp: Date.now(),
    };
    const aiMessagePlaceholder: Message = {
      id: `msg-${Date.now() + 1}`,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage, aiMessagePlaceholder]);

    try {
      const conversationForDecision = [...messages, userMessage];
      const decision = await decideNextAction(
        currentEngine,
        userMessage,
        conversationForDecision,
        config,
        semanticMemoryClient,
      );

      const searchAllowed = config.toolSearchEnabled;
      const shouldSearch =
        searchAllowed && decision.action === "search" && !!decision.query;
      let externalEvidence: string | null = null;
      let searchSources: Source[] = [];

      if (decision.action === "search" && !decision.query) {
        console.warn("Décision de recherche sans requête fournie", decision);
        addToast(
          "Recherche incomplète",
          "La décision demandait une recherche mais sans requête. Réponse directe en cours.",
          "warning",
        );
      }

      if (decision.action === "search" && !searchAllowed) {
        addToast(
          "Recherche désactivée",
          "L'outil de recherche web est désactivé dans les paramètres. Réponse directe appliquée.",
          "info",
        );
      }

      if (shouldSearch) {
        const query = decision.query as string;
        setSearchQuery(query);

        const searchResult = await performWebSearch(
          query,
          abortControllerRef.current?.signal,
        );
        setSearchQuery(null);
        externalEvidence = searchResult.content;
        searchSources = searchResult.sources;
      }

      const contextForAnswer = shouldSearch
        ? await buildContext(currentEngine, {
            userMessage,
            history: conversationForDecision,
            config,
            memory: semanticMemoryClient,
            externalEvidence,
          })
        : decision.context;

      setReasoningTrace({
        id: Date.now(),
        requestedAction: decision.action,
        effectiveAction: shouldSearch ? "search" : "respond",
        query: decision.query,
        plan: decision.plan,
        rationale: decision.rationale,
        memoryContext: contextForAnswer.slices.memorySummary || "",
        memoryEnabled: config.semanticMemoryEnabled,
        memoryResults:
          (contextForAnswer.slices.memoryResults as ScoredMemoryEntry[] | undefined) ||
          [],
        timestamp: Date.now(),
      });

      const finalMessages = contextForAnswer.messagesForAnswer;
      let finalAiResponse = await streamAnswer(
        finalMessages,
        aiMessagePlaceholder.id,
      );

      if (shouldSearch && searchSources.length > 0) {
        const uniqueSources = Array.from(
          new Map(searchSources.map((s) => [s.url, s])).values(),
        );
        const sourcesText =
          "\n\nSources utilisées:\n" +
          uniqueSources.map((src) => `- ${src.title} (${src.url})`).join("\n");
        finalAiResponse += sourcesText;
      }

      if (!finalAiResponse.trim()) {
        console.warn("Réponse finale vide, déclenchement d'une relance.");

        addToast(
          "Réponse manquante",
          "Aucune réponse utilisable fournie, une relance a été déclenchée.",
          "warning",
        );

        finalAiResponse = await streamAnswer(
          finalMessages,
          aiMessagePlaceholder.id,
        );

        if (!finalAiResponse.trim()) {
          finalAiResponse =
            "Désolé, je n'ai pas pu générer de réponse. Veuillez reformuler votre question.";
        }
      }

      let updatedMessages: Message[] | null = null;
      setMessages((prev) => {
        const next = prev.map((msg) =>
          msg.id === aiMessagePlaceholder.id
            ? { ...msg, content: finalAiResponse }
            : msg,
        );
        updatedMessages = next;
        return next;
      });

      if (updatedMessages) {
        saveConversation(updatedMessages);
      }

      await recordExchange(userMessage, {
        ...aiMessagePlaceholder,
        content: finalAiResponse,
      });
    } catch (err: any) {
      console.error("Chat / tool error:", err);
      const recovered = await handleEngineError(err);
      if (!recovered) {
        addToast(
          "Erreur",
          err?.message || "Une erreur est survenue pendant la génération.",
          "error",
        );
      }
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessagePlaceholder.id
            ? {
                ...msg,
                content:
                  "Désolé, une erreur est survenue pendant la génération. Réessaie dans un instant.",
              }
            : msg,
        ),
      );
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
  };

  const handleSaveSettings = (newConfig: Config) => {
    const normalizedSearchApiBase = normalizeSearchApiBase(
      newConfig.searchApiBase,
    );

    setConfig((prevConfig) => {
      const updatedConfig = {
        ...prevConfig,
        ...newConfig,
        searchApiBase: normalizedSearchApiBase,
      };
      localStorage.setItem("mg_model", updatedConfig.modelId);
      localStorage.setItem("mg_system", updatedConfig.systemPrompt);
      localStorage.setItem("mg_temp", updatedConfig.temperature.toString());
      localStorage.setItem("mg_max_tokens", updatedConfig.maxTokens.toString());
      // FIX: Explicitly cast newTheme to Config['theme'] to satisfy type checker.
      localStorage.setItem("mg_theme", updatedConfig.theme as Config["theme"]);
      localStorage.setItem(
        "mg_semantic_memory_enabled",
        String(updatedConfig.semanticMemoryEnabled),
      );
      localStorage.setItem(
        "mg_semantic_max_entries",
        updatedConfig.semanticMemoryMaxEntries.toString(),
      );
      localStorage.setItem(
        "mg_semantic_neighbors",
        updatedConfig.semanticMemoryNeighbors.toString(),
      );
      localStorage.setItem(
        "mg_tool_search_enabled",
        String(updatedConfig.toolSearchEnabled),
      );
      localStorage.setItem("mg_search_api_base", updatedConfig.searchApiBase);
      return updatedConfig;
    });

    addToast(
      "Configuration",
      "Les modifications ont été sauvegardées.",
      "success",
    );

    if (newConfig.modelId !== config.modelId && engine) {
      setTimeout(() => {
        if (
          confirm(
            "Le modèle a changé. Recharger la page pour appliquer le changement ?",
          )
        ) {
          window.location.reload();
        }
      }, 500);
    }
  };

  const toggleTheme = () => {
    const newTheme = config.theme === "dark" ? "light" : "dark";
    setConfig((prevConfig) => {
      const updatedConfig = {
        ...prevConfig,
        theme: newTheme as Config["theme"],
      }; // FIX: Explicitly cast newTheme to Config['theme']
      localStorage.setItem("mg_theme", newTheme);
      return updatedConfig;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-32 w-80 h-80 rounded-full bg-primary-DEFAULT/15 blur-[100px]" />
        <div className="absolute right-[-80px] top-10 w-72 h-72 rounded-full bg-indigo-500/20 blur-[110px]" />
        <div className="absolute left-1/2 bottom-[-120px] -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-gradient-to-r from-primary-DEFAULT/10 via-purple-500/5 to-transparent blur-[130px]" />
      </div>

      <Header
        onSettings={() => setIsSettingsVisible(true)}
        theme={config.theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <HeroHeader
          engineStatus={engineStatus}
          initProgress={initProgress}
          config={config}
        />

        <CapabilityPills config={config} webGPUAvailable={webGPUAvailable} />

        <div className="w-full max-w-4xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-700/60 rounded-3xl shadow-lg shadow-slate-900/5 dark:shadow-black/30 backdrop-blur-sm flex flex-col overflow-hidden">
          <StatusBar
            status={engineStatus}
            progress={initProgress}
            performanceStats={performanceStats}
            onReload={loadEngine}
          />
          {/* FIX: Changed `searchQuery` prop to `query` as expected by `SearchIndicator` component. */}
          <SearchIndicator query={searchQuery} />
          <ReasoningVisualizer
            trace={reasoningTrace}
            onClear={() => setReasoningTrace(null)}
          />
          <div className="flex-1 border-t border-slate-100 dark:border-slate-800">
            {engineStatus !== "ready" ? (
              <EmptyState
                status={engineStatus}
                progress={initProgress}
                onLoad={loadEngine}
              />
            ) : (
              <ChatContainer
                messages={messages}
                isGenerating={isGenerating}
                searchQuery={searchQuery}
              />
            )}
          </div>
          <div className="border-t border-slate-100 dark:border-slate-800 bg-gradient-to-r from-slate-50/90 via-white/70 to-slate-100/90 dark:from-slate-900/90 dark:via-slate-900/70 dark:to-slate-900/90">
            <InputBar
              onSend={handleSend}
              onStop={handleStop}
              isGenerating={isGenerating}
              engineStatus={engineStatus}
              assistantText={lastAssistantMessage || ""}
            />
          </div>
        </div>
      </main>
      <SettingsModal
        isVisible={isSettingsVisible}
        onClose={() => setIsSettingsVisible(false)}
        onSave={handleSaveSettings}
        currentConfig={config}
      />
      <ToastContainer
        toasts={toasts}
        removeToast={(id) =>
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
      />
    </div>
  );
};

export default App;
