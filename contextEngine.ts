import type { Message, Config, MLCEngine } from "./types";

/**
 * Categories used to give a rough idea of what kind of task we are handling.
 * They are used only for debugging & potential future routing.
 */
export type TaskCategory =
  | "chitchat"
  | "evergreen_qa"
  | "coding"
  | "planning"
  | "needs_web"
  | "unknown";

export interface ScoredMemoryEntry {
  id: string;
  content: string;
  score: number;
  timestamp?: string | number;
}

export interface SemanticMemoryClient {
  enabled: boolean;
  search: (
    query: string,
    neighbors: number,
  ) => Promise<{
    results: ScoredMemoryEntry[];
  }>;
}

/**
 * Token budget split used by the context builder.
 */
export interface ContextBudget {
  totalTokens: number;
  systemTokens: number;
  planningTokens: number;
  answerTokens: number;
}

/**
 * Context slices are the “building blocks” we feed to the model and to
 * the UI ReasoningVisualizer.
 */
export interface ContextSlices {
  systemPrompt: string;
  conversationMessages: Message[];
  conversationSummary: string | null;
  memorySummary: string | null;
  memoryResults: ScoredMemoryEntry[];
  externalContext: string | null;
  debug: {
    taskCategory: TaskCategory;
    chosenHistoryCount: number;
    memoryHitCount: number;
    truncatedHistory: boolean;
  };
}

export interface ContextBuildInput {
  userMessage: Message;
  history: Message[];
  memory: SemanticMemoryClient | null;
  config: Config;
  externalEvidence?: string | null;
  budget?: Partial<ContextBudget>;
}

export interface ContextBuildResult {
  slices: ContextSlices;
  messagesForPlanning: { role: string; content: string }[];
  messagesForAnswer: { role: string; content: string }[];
}

/* ------------------------------------------------------------------ */
/*   Utilities                                                         */
/* ------------------------------------------------------------------ */

function estimateTokens(text: string): number {
  if (!text) return 0;
  // Very rough heuristic, but good enough for budgeting.
  return Math.ceil(text.length / 4);
}

function classifyTaskHeuristic(text: string): TaskCategory {
  const lower = text.toLowerCase();

  if (lower.match(/\b(code|typescript|python|erreur|stack trace|exception)\b/)) {
    return "coding";
  }
  if (lower.match(/\b(plan|roadmap|étapes|strategy|stratégie)\b/)) {
    return "planning";
  }
  if (
    lower.match(
      /\b(today|now|current|latest|aujourd'hui|maintenant|cette année|2024|2025)\b/,
    )
  ) {
    return "needs_web";
  }
  if (lower.length < 50) {
    return "chitchat";
  }
  if (lower.match(/\b(why|how|comment|pourquoi|explain|différence|compare)\b/)) {
    return "evergreen_qa";
  }
  return "unknown";
}

function scoreHistoryMessage(
  msg: Message,
  idxFromEnd: number,
  query: string,
): number {
  let score = 0;

  // Recency: newer messages → higher score
  const recencyScore = 1 / (1 + idxFromEnd);
  score += 1.25 * recencyScore;

  // Role weighting
  if (msg.role === "user") score += 0.7;
  else if (msg.role === "assistant") score += 0.5;
  else if (msg.role === "tool") score += 0.3;

  // Light lexical overlap boost
  const lower = (msg.content || "").toLowerCase();
  const qWords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const overlapCount = qWords.filter((w) => lower.includes(w)).length;
  score += 0.15 * overlapCount;

  return score;
}

function selectHistoryUnderBudget(
  history: Message[],
  query: string,
  tokenBudget: number,
): { selected: Message[]; truncated: boolean } {
  const scored = history.map((msg, i) => {
    const idxFromEnd = history.length - 1 - i;
    return { msg, score: scoreHistoryMessage(msg, idxFromEnd, query) };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: Message[] = [];
  let usedTokens = 0;
  let truncated = false;

  for (const { msg } of scored) {
    const tokens = estimateTokens(msg.content || "");
    if (usedTokens + tokens > tokenBudget) {
      truncated = true;
      break;
    }
    selected.push(msg);
    usedTokens += tokens;
  }

  // Preserve chronological order for the final prompt
  selected.sort((a, b) => {
    const aTs = Number(a.timestamp);
    const bTs = Number(b.timestamp);

    if (Number.isFinite(aTs) && Number.isFinite(bTs)) {
      return aTs - bTs;
    }

    return 0;
  });
  return { selected, truncated };
}

function clampText(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

/**
 * LLM-based summarisation helper. Uses the same MLCEngine as the main chat.
 */
async function summarizeWithLLM(
  engine: MLCEngine,
  input: string,
  language: "fr" | "en" | "auto" = "fr",
): Promise<string> {
  if (!input.trim()) return "";

  const localeHint =
    language === "auto"
      ? "Tu peux répondre en français ou en anglais selon le contenu."
      : language === "fr"
      ? "Réponds en français."
      : "Respond in English.";

  const prompt = `
Tu es un assistant spécialisé en synthèse ultra-compacte.

${localeHint}

Texte à résumer:
---
${input}
---

Tâche:
1. Extraire uniquement les informations importantes (faits, décisions, contraintes).
2. Produire un résumé en 5–10 puces maximum.
3. Ne pas inventer d'informations.
4. Être aussi concis que possible, mais sans perdre les éléments clés.
`;

  const result = await engine.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "Tu es un expert en résumé très concis et fidèle.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 512,
    stream: false,
  });

  const content =
    (result as any).choices?.[0]?.message?.content ??
    "[Résumé indisponible – modèle muet]";
  return typeof content === "string" ? content : JSON.stringify(content);
}

/* ------------------------------------------------------------------ */
/*   Main builder                                                      */
/* ------------------------------------------------------------------ */

export async function buildContext(
  engine: MLCEngine,
  input: ContextBuildInput,
): Promise<ContextBuildResult> {
  const {
    userMessage,
    history,
    memory,
    config,
    externalEvidence = null,
    budget,
  } = input;

  const effectiveBudget: ContextBudget = {
    totalTokens: budget?.totalTokens ?? 4096,
    systemTokens: budget?.systemTokens ?? 800,
    planningTokens: budget?.planningTokens ?? 1200,
    answerTokens: budget?.answerTokens ?? 2800,
  };

  const userText = userMessage.content || "";
  const taskCategory = classifyTaskHeuristic(userText);

  /* -------------------- 1) System prompt --------------------------- */

  const systemFromConfig =
    // optional in Config, so we guard
    (config as any).systemPrompt && typeof (config as any).systemPrompt === "string"
      ? ((config as any).systemPrompt as string)
      : null;

  const systemPrompt =
    systemFromConfig ??
    `
Tu es "monGARS", un assistant IA local exécuté dans le navigateur via WebGPU.
Tu es:
- Rigoureux sur les faits.
- Transparent sur ce que tu sais / ne sais pas.
- Capable d'utiliser une mémoire sémantique et des outils externes (par ex. recherche web).

Règles:
1. Tu expliques ton raisonnement de manière structurée, sans verbiage inutile.
2. Tu indiques explicitement si tu t'appuies sur:
   - la conversation récente,
   - la mémoire à long terme,
   - des informations externes.
3. Si tu n'es pas sûr, tu explicites tes incertitudes.
4. Tu évites d'inventer des sources ou des références précises que tu n'as pas.

Les blocs de contexte fournis sont:
- [CONVERSATION] : extraits récents de la discussion.
- [MEMOIRE]      : résumé des éléments pertinents retrouvés dans la mémoire.
- [EXTERNE]      : informations issues d'outils externes (recherche, API, etc.).
`.trim();

  /* -------------------- 2) History selection ----------------------- */

  // Token budget for raw history before summarisation.
  const historyBudgetTokens = Math.max(
    200,
    Math.min(effectiveBudget.answerTokens - 800, 2000),
  );

  const { selected: selectedHistory, truncated } = selectHistoryUnderBudget(
    history,
    userText,
    historyBudgetTokens,
  );

  let conversationMessages: Message[] = selectedHistory;
  let conversationSummary: string | null = null;

  if (truncated && selectedHistory.length > 6) {
    const older = selectedHistory.slice(0, selectedHistory.length - 4);
    const recent = selectedHistory.slice(-4);

    const olderText = older
      .map(
        (m) =>
          `${m.role.toUpperCase()}: ${clampText(m.content || "", 128)}`,
      )
      .join("\n");

    const summary = await summarizeWithLLM(engine, olderText, "fr");
    conversationSummary = summary;
    conversationMessages = recent;
  }

  /* -------------------- 3) Semantic memory ------------------------- */

  let memorySummary: string | null = null;
  let memoryResults: ScoredMemoryEntry[] = [];
  let memoryHitCount = 0;

  if (memory && memory.enabled) {
    try {
      const searchResult = await memory.search(userText, 8);
      memoryResults = searchResult.results || [];
      memoryHitCount = memoryResults.length;

      if (memoryResults.length > 0) {
        const raw = memoryResults
          .map(
            (r, idx) =>
              `(${idx + 1}) score=${r.score.toFixed(
                3,
              )} – ${clampText(r.content, 128)}`,
          )
          .join("\n");

        memorySummary = await summarizeWithLLM(engine, raw, "fr");
      }
    } catch (err) {
      console.warn("[contextEngine] memory.search failed:", err);
    }
  }

  /* -------------------- 4) External context ------------------------ */

  const externalContext = externalEvidence
    ? `Résultats d'outils externes (par ex. recherche web):\n\n${externalEvidence}`
    : null;

  /* -------------------- 5) Slices struct --------------------------- */

  const slices: ContextSlices = {
    systemPrompt,
    conversationMessages,
    conversationSummary,
    memorySummary,
    memoryResults,
    externalContext,
    debug: {
      taskCategory,
      chosenHistoryCount: conversationMessages.length,
      memoryHitCount,
      truncatedHistory: truncated,
    },
  };

  /* -------------------- 6) Planning messages ----------------------- */

  const planningContextParts: string[] = [];

  if (conversationSummary) {
    planningContextParts.push(
      "[Résumé de la conversation récente]\n" + conversationSummary,
    );
  }

  const convoPreview = conversationMessages
    .map(
      (m) =>
        `${m.role === "user" ? "Utilisateur" : m.role === "assistant" ? "Assistant" : "Outil"}: ${clampText(
          m.content || "",
          96,
        )}`,
    )
    .join("\n");

  if (convoPreview) {
    planningContextParts.push("[Derniers échanges]\n" + convoPreview);
  }

  if (memorySummary) {
    planningContextParts.push("[Résumé mémoire]\n" + memorySummary);
  }

  if (externalContext) {
    planningContextParts.push("[Infos externes]\n" + externalContext);
  }

  const planningContextText =
    planningContextParts.join("\n\n") ||
    "(Pas de contexte supplémentaire disponible)";

  const messagesForPlanning = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `
[CONTEXTE POUR PLANIFICATION]

${planningContextText}

[QUESTION UTILISATEUR]
${userText}

Tâche:
1. Analyser la question.
2. Identifier quelles parties du contexte sont réellement utiles.
3. Proposer un plan de réponse (quelques étapes numérotées).
4. Indiquer si une recherche externe est nécessaire ou non.
`.trim(),
    },
  ];

  /* -------------------- 7) Answer messages ------------------------- */

  const convoBlock = conversationSummary
    ? `[Résumé conversation]\n${conversationSummary}\n\n`
    : "";

  const convoTurns = conversationMessages
    .map(
      (m) =>
        `${m.role === "user" ? "Utilisateur" : m.role === "assistant" ? "Assistant" : "Outil"}: ${m.content}`,
    )
    .join("\n");

  const memoryBlock = memorySummary
    ? `\n[MEMOIRE]\n${memorySummary}\n`
    : "\n[MEMOIRE]\n(pas d'éléments mémoire particuliers ou mémoire désactivée)\n";

  const externalBlock = externalContext
    ? `\n[EXTERNE]\n${externalContext}\n`
    : "\n[EXTERNE]\n(aucune information externe fournie pour cette requête)\n";

  const messagesForAnswer = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `
[CONVERSATION]
${convoBlock}${convoTurns}

${memoryBlock}
${externalBlock}

[QUESTION UTILISATEUR]
${userText}

Consignes:
- Utilise les blocs [CONVERSATION], [MEMOIRE] et [EXTERNE] de manière critique.
- Si quelque chose est contradictoire, signale-le.
- Si tu n'as pas assez d'informations, explique ce qui manque.
- Donne une réponse structurée, claire, et adaptée au niveau de l'utilisateur.
`.trim(),
    },
  ];

  return {
    slices,
    messagesForPlanning,
    messagesForAnswer,
  };
}

/**
 * Rebuild context using an existing build as baseline, but with new external evidence.
 * This is useful when you perform a web search *after* an initial planning step.
 */
export async function rebuildContextWithExternalEvidence(
  engine: MLCEngine,
  previousResult: ContextBuildResult,
  input: Omit<ContextBuildInput, "history" | "config"> & {
    history: Message[];
    config: Config;
    externalEvidence: string | null;
  },
): Promise<ContextBuildResult> {
  // We could try to re-use previous slices here, but to keep the
  // logic robust and predictable we simply call buildContext again
  // with the new evidence. This ensures that history & memory are
  // re-evaluated if needed.
  return buildContext(engine, {
    ...input,
    externalEvidence: input.externalEvidence,
  });
}
