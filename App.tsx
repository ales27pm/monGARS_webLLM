import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useSemanticMemory } from "./useSemanticMemory";
import type {
  Message,
  Config,
  EngineStatus,
  ToastInfo,
  InitProgressReport,
  MLCEngine,
} from "./types";
import { buildAnswerHistory, decideAction, MODEL_ID } from "./decisionEngine";

declare global {
  interface Navigator {
    gpu?: any;
  }
}

const searchTool = {
  name: "search_the_web",
  description:
    "Useful when you need to look up current information, news, or factual data that may change over time. Use only for questions that require up-to-date information.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to use. Should be concise and specific.",
      },
    },
    required: ["query"],
  },
};

const toolSpecPrompt = `- ${searchTool.name}: ${searchTool.description}
  params schema: ${JSON.stringify(searchTool.parameters)}`;

type Source = { title: string; url: string };

const FRESH_DATA_PATTERNS = [
  /\bmet[eé]o|m[eé]t[eé]o|temp[eé]rature|forecast|pr[eé]vision/i,
  /\bactualité|news|derni[eè]res?\s+infos?/i,
  /\baujourd'hui|today|ce\s+jour|maintenant/i,
  /\bheure\s+actuelle|time\b/i,
];

const normalizeQuery = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[?!.]+$/, "")
    .trim()
    .slice(0, 180);

const deriveFreshDataQuery = (text: string) => {
  if (!text) return null;
  const match = FRESH_DATA_PATTERNS.some((pattern) => pattern.test(text));
  return match ? normalizeQuery(text) : null;
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

  const { buildMemoryContext, recordExchange } = useSemanticMemory(messages);

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

  const [config, setConfig] = useState<Config>(() => {
    return {
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
    };
  });

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
      return false;
    }
    return true;
  }, [addToast]);

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
        `Modèle ${selectedModel.replace("-q4f16_1-MLC", "")} prêt.`,
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
          console.error("Engine recovery failed: loadEngine did not initialize a new engine");
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
    addToast("Recherche Web", `Recherche de "${query}"...`, "info");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const forwardAbort = () => controller.abort(parentSignal?.reason as any);

    if (parentSignal) {
      parentSignal.addEventListener("abort", forwardAbort);
    }

    try {
      const response = await fetch(
        `https://corsproxy.io/?${encodeURIComponent(
          `https://api.duckduckgo.com/?q=${encodeURIComponent(
            query,
          )}&format=json&no_html=1`,
        )}`,
        {
          signal: controller.signal,
        },
      );
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
      const memoryContext = await buildMemoryContext(trimmedInput);
      const memoryPrefix = memoryContext
        ? `Mémoire sémantique pertinente :\n${memoryContext}\n\n`
        : "";
      const decision = await decideAction(
        currentEngine,
        trimmedInput,
        conversationForDecision,
        toolSpecPrompt,
        abortControllerRef.current?.signal,
      );

      const decisionPlan =
        decision.plan?.trim() || "Réponse directe structurée";
      const fallbackSearchPlan =
        "1) Identifier l'information demandée nécessitant des données fraîches.\n" +
        "2) Exploiter les résultats web fiables.\n" +
        "3) Répondre en français clair en citant les sources réelles.";
      const forcedQuery =
        decision.action === "respond" ? deriveFreshDataQuery(trimmedInput) : null;

      const searchQueryToUse =
        decision.action === "search" && decision.query
          ? decision.query
          : forcedQuery;
      let finalAiResponse = "";

      if (searchQueryToUse) {
        const query = searchQueryToUse;
        setSearchQuery(query);

        const searchResult = await performWebSearch(
          query,
          abortControllerRef.current?.signal,
        );
        setSearchQuery(null);

        const historyForAnswer = buildAnswerHistory(
          decision.action === "search" && decision.query
            ? decisionPlan
            : fallbackSearchPlan,
          config,
          conversationForDecision,
          `${memoryPrefix}${trimmedInput}\n\n` +
            `Résultats de la recherche pour "${query}":\n${searchResult.content}\n\n` +
            `Applique le plan ci-dessus. Si les données sont insuffisantes, explique pourquoi et propose des pistes concrètes.`,
        );

        finalAiResponse = await streamAnswer(
          historyForAnswer,
          aiMessagePlaceholder.id,
        );
        if (searchResult.sources.length > 0) {
          const uniqueSources = Array.from(
            new Map(searchResult.sources.map((s) => [s.url, s])).values(),
          );
          const sourcesText =
            "\n\nSources utilisées:\n" +
            uniqueSources
              .map((src) => `- ${src.title} (${src.url})`)
              .join("\n");
          finalAiResponse += sourcesText;
        }
      } else {
        const directResponse = decision.response?.trim();
        if (directResponse) {
          finalAiResponse = directResponse;
        } else {
          const history = buildAnswerHistory(
            decisionPlan,
            config,
            conversationForDecision,
            `${memoryPrefix}${trimmedInput}`,
          );

          finalAiResponse = await streamAnswer(
            history,
            aiMessagePlaceholder.id,
          );
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
    setConfig((prevConfig) => {
      const updatedConfig = { ...prevConfig, ...newConfig };
      localStorage.setItem("mg_model", updatedConfig.modelId);
      localStorage.setItem("mg_system", updatedConfig.systemPrompt);
      localStorage.setItem("mg_temp", updatedConfig.temperature.toString());
      localStorage.setItem("mg_max_tokens", updatedConfig.maxTokens.toString());
      // FIX: Explicitly cast newTheme to Config['theme'] to satisfy type checker.
      localStorage.setItem("mg_theme", updatedConfig.theme as Config["theme"]);
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
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-900">
      <Header
        onSettings={() => setIsSettingsVisible(true)}
        theme={config.theme}
        onToggleTheme={toggleTheme}
      />
      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <div className="w-full max-w-3xl bg-white/70 dark:bg-slate-900/70 border border-slate-200/60 dark:border-slate-700/60 rounded-3xl shadow-lg shadow-slate-900/5 dark:shadow-black/30 backdrop-blur-sm flex flex-col overflow-hidden">
          <StatusBar
            status={engineStatus}
            progress={initProgress}
            performanceStats={performanceStats}
            onReload={loadEngine}
          />
          {/* FIX: Changed `searchQuery` prop to `query` as expected by `SearchIndicator` component. */}
          <SearchIndicator query={searchQuery} />
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
          <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80">
            <InputBar
              onSend={handleSend}
              onStop={handleStop}
              isGenerating={isGenerating}
              engineStatus={engineStatus}
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
