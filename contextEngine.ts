import {
  buildContextualHints,
  buildRequestProfile,
  type RequestProfile,
} from "./contextProfiling";
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
  contextualHints: string;
  debug: {
    taskCategory: TaskCategory;
    chosenHistoryCount: number;
    memoryHitCount: number;
    memoryQueries: string[];
    memoryCandidates: number;
    truncatedHistory: boolean;
    intent: string;
    requiresFreshData: boolean;
    followUpDetected: boolean;
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

  if (
    lower.match(/\b(code|typescript|python|erreur|stack trace|exception)\b/)
  ) {
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
  if (
    lower.match(/\b(why|how|comment|pourquoi|explain|différence|compare)\b/)
  ) {
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

function safeTimestamp(value: Message["timestamp"]): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function selectHistoryUnderBudget(
  history: Message[],
  query: string,
  tokenBudget: number,
): { selected: Message[]; truncated: boolean } {
  const scored = history.map((msg, i) => {
    const idxFromEnd = history.length - 1 - i;
    return {
      msg,
      score: scoreHistoryMessage(msg, idxFromEnd, query),
      index: i,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: { msg: Message; index: number }[] = [];
  let usedTokens = 0;
  let truncated = false;

  for (const { msg, index } of scored) {
    const tokens = estimateTokens(msg.content || "");
    if (usedTokens + tokens > tokenBudget) {
      truncated = true;
      break;
    }
    selected.push({ msg, index });
    usedTokens += tokens;
  }

  // Preserve chronological order for the final prompt, placing valid timestamps first
  selected.sort((a, b) => {
    const aTs = safeTimestamp(a.msg.timestamp);
    const bTs = safeTimestamp(b.msg.timestamp);

    if (aTs !== null && bTs !== null) {
      const diff = aTs - bTs;
      if (diff !== 0) return diff;
    }

    if (aTs !== null) return -1;
    if (bTs !== null) return 1;

    // Fallback to original index to keep order deterministic
    return a.index - b.index;
  });

  return { selected: selected.map((entry) => entry.msg), truncated };
}

function clampText(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "…";
}

function lexicalOverlapScore(a: string, b: string): number {
  const tokenize = (text: string) =>
    new Set(
      (
        text
          ?.normalize("NFKD")
          .toLowerCase()
          .match(/[\p{L}\d]{3,}/gu) || []
      ).map((t) => t),
    );

  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const denominator = tokensA.size + tokensB.size - overlap;
  return denominator === 0 ? 0 : overlap / denominator;
}

function deduplicateMemoryResults(
  entries: ScoredMemoryEntry[],
): ScoredMemoryEntry[] {
  const byKey = new Map<string, ScoredMemoryEntry>();

  for (const entry of entries) {
    const key = entry.id || entry.content?.slice(0, 160) || "";
    if (!key) continue;

    const existing = byKey.get(key);
    if (!existing || existing.score < entry.score) {
      byKey.set(key, entry);
    }
  }

  return Array.from(byKey.values());
}

function diversifyMemoryResults(
  entries: ScoredMemoryEntry[],
  limit: number,
): ScoredMemoryEntry[] {
  const selected: ScoredMemoryEntry[] = [];

  for (const entry of entries) {
    const nearDuplicate = selected.some(
      (existing) => lexicalOverlapScore(existing.content, entry.content) > 0.72,
    );
    if (nearDuplicate) continue;

    selected.push(entry);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildMemoryQueries(
  userText: string,
  profile: RequestProfile,
  recentHistory: Message[],
): string[] {
  const queries = new Set<string>();
  const trimmed = userText.trim();
  if (trimmed) queries.add(trimmed);

  const anchors = profile.contextualAnchors.filter(Boolean).slice(0, 6);
  if (anchors.length > 0) {
    queries.add(anchors.join(" "));
  }

  if (profile.followUpDetected) {
    const lastUser = [...recentHistory]
      .reverse()
      .find((m) => m.role === "user" && m.content !== userText);
    if (lastUser?.content) {
      queries.add(`${lastUser.content}\n${userText}`);
    }
  }

  if (profile.intent === "code") {
    queries.add(`${userText}\nstack trace erreur code exemple`);
  } else if (profile.intent === "analysis") {
    queries.add(`${userText}\ncauses impacts comparaison synthèse`);
  }

  return Array.from(queries)
    .filter((q) => q.trim().length > 0)
    .slice(0, 5);
}

function composeSystemPrompt(config: Config, contextualHints: string) {
  const systemFromConfig =
    typeof config.systemPrompt === "string" ? config.systemPrompt : null;

  if (systemFromConfig) return systemFromConfig;

  return `
Tu es "monGARS", un assistant IA local, expert en conversation et en pilotage d'outils (recherche web, mémoire sémantique, appels de fonctions). Tu optimises la clarté et la concision tout en restant transparent sur tes sources.

Principes:
- Mets en avant les faits vérifiables et les sources explicites.
- Utilise la mémoire sémantique pour rappeler les points clés pertinents sans t'égarer.
- Active les outils uniquement quand ils apportent une valeur concrète; sinon réponds directement.
- Ne divulgue pas ton raisonnement sous forme de liste exhaustive ou "tree-of-thought"; résume en quelques étapes clés si nécessaire.
- Si l'utilisateur demande du code ou des actions, propose des étapes sûres et exécutables sans inventer de dépendances cachées.
- Mentionne clairement quand tu t'appuies sur des données externes, la conversation ou la mémoire.

Indices de contexte à garder à l'esprit pour cette session:
${contextualHints}
`.trim();
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

function computeEffectiveBudget(
  budget?: Partial<ContextBudget>,
): ContextBudget {
  return {
    totalTokens: budget?.totalTokens ?? 4096,
    systemTokens: budget?.systemTokens ?? 800,
    planningTokens: budget?.planningTokens ?? 1200,
    answerTokens: budget?.answerTokens ?? 2800,
  };
}

async function buildConversationSliceWithSummary(
  engine: MLCEngine,
  history: Message[],
  userText: string,
  budget: ContextBudget,
): Promise<{
  messages: Message[];
  summary: string | null;
  truncated: boolean;
}> {
  const historyBudgetTokens = Math.max(
    200,
    Math.min(budget.answerTokens - 800, 2000),
  );

  const { selected, truncated } = selectHistoryUnderBudget(
    history,
    userText,
    historyBudgetTokens,
  );

  if (!(truncated && selected.length > 6)) {
    return { messages: selected, summary: null, truncated };
  }

  const older = selected.slice(0, selected.length - 4);
  const recent = selected.slice(-4);

  const olderText = older
    .map((m) => `${m.role.toUpperCase()}: ${clampText(m.content || "", 128)}`)
    .join("\n");

  const summary = await summarizeWithLLM(engine, olderText, "fr");
  return { messages: recent, summary, truncated };
}

async function buildMemorySlice(
  engine: MLCEngine,
  memory: SemanticMemoryClient | null,
  userText: string,
  requestProfile: RequestProfile,
  recentHistory: Message[],
): Promise<{
  summary: string | null;
  results: ScoredMemoryEntry[];
  hitCount: number;
  queriesUsed: string[];
  candidateCount: number;
}> {
  if (!memory || !memory.enabled) {
    return {
      summary: null,
      results: [],
      hitCount: 0,
      queriesUsed: [],
      candidateCount: 0,
    };
  }

  const queries = buildMemoryQueries(userText, requestProfile, recentHistory);

  if (queries.length === 0) {
    return {
      summary: null,
      results: [],
      hitCount: 0,
      queriesUsed: [],
      candidateCount: 0,
    };
  }

  try {
    const queryResults = await Promise.all(
      queries.map(async (query) => {
        const searchResult = await memory.search(query, 8);
        return searchResult.results || [];
      }),
    );

    const flattened = queryResults.flat();
    if (flattened.length === 0) {
      return {
        summary: null,
        results: [],
        hitCount: 0,
        queriesUsed: queries,
        candidateCount: 0,
      };
    }

    const deduped = deduplicateMemoryResults(flattened).sort(
      (a, b) => b.score - a.score,
    );
    const diversified = diversifyMemoryResults(deduped, 8);
    const hitCount = diversified.length;

    const raw = diversified
      .map(
        (r, idx) =>
          `(${idx + 1}) score=${r.score.toFixed(3)} – ${clampText(
            r.content,
            128,
          )}`,
      )
      .join("\n");

    const summary = await summarizeWithLLM(engine, raw, "fr");
    return {
      summary,
      results: diversified,
      hitCount,
      queriesUsed: queries,
      candidateCount: deduped.length,
    };
  } catch (err) {
    console.warn("[contextEngine] memory.search failed:", err);
    return {
      summary: null,
      results: [],
      hitCount: 0,
      queriesUsed: queries,
      candidateCount: 0,
    };
  }
}

function buildPlanningMessagesFromSlices(
  slices: ContextSlices,
  userText: string,
): { role: string; content: string }[] {
  const planningContextParts: string[] = [];

  if (slices.conversationSummary) {
    planningContextParts.push(
      "[Résumé de la conversation récente]\n" + slices.conversationSummary,
    );
  }

  const convoPreview = slices.conversationMessages
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

  if (slices.memorySummary) {
    planningContextParts.push("[Résumé mémoire]\n" + slices.memorySummary);
  }

  if (slices.contextualHints) {
    planningContextParts.push("[Profil contextuel]\n" + slices.contextualHints);
  }

  if (slices.externalContext) {
    planningContextParts.push("[Infos externes]\n" + slices.externalContext);
  }

  const planningContextText =
    planningContextParts.join("\n\n") ||
    "(Pas de contexte supplémentaire disponible)";

  return [
    { role: "system", content: slices.systemPrompt },
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
}

function buildAnswerMessagesFromSlices(
  slices: ContextSlices,
  userText: string,
): { role: string; content: string }[] {
  const convoBlock = slices.conversationSummary
    ? `[Résumé conversation]\n${slices.conversationSummary}\n\n`
    : "";

  const convoTurns = slices.conversationMessages
    .map(
      (m) =>
        `${m.role === "user" ? "Utilisateur" : m.role === "assistant" ? "Assistant" : "Outil"}: ${m.content}`,
    )
    .join("\n");

  const memoryBlock = slices.memorySummary
    ? `\n[MEMOIRE]\n${slices.memorySummary}\n`
    : "\n[MEMOIRE]\n(pas d'éléments mémoire particuliers ou mémoire désactivée)\n";

  const hintsBlock = slices.contextualHints
    ? `\n[ANCRAGES CONTEXTUELS]\n${slices.contextualHints}\n`
    : "";

  const externalBlock = slices.externalContext
    ? `\n[EXTERNE]\n${slices.externalContext}\n`
    : "\n[EXTERNE]\n(aucune information externe fournie pour cette requête)\n";

  return [
    { role: "system", content: slices.systemPrompt },
    {
      role: "user",
      content: `
[CONVERSATION]
${convoBlock}${convoTurns}

${memoryBlock}
${hintsBlock}
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

  const effectiveBudget = computeEffectiveBudget(budget);

  const userText = userMessage.content || "";
  const taskCategory = classifyTaskHeuristic(userText);
  const recentForProfile = history.slice(-8);
  const requestProfile = buildRequestProfile(userText, recentForProfile);
  const contextualHints = buildContextualHints(userText, recentForProfile);

  /* -------------------- 1) System prompt --------------------------- */

  const systemPrompt = composeSystemPrompt(config, contextualHints);

  /* -------------------- 2) History selection ----------------------- */

  const [
    {
      messages: conversationMessages,
      summary: conversationSummary,
      truncated: truncatedHistory,
    },
    {
      summary: memorySummary,
      results: memoryResults,
      hitCount: memoryHitCount,
      queriesUsed: memoryQueries,
      candidateCount: memoryCandidates,
    },
  ] = await Promise.all([
    buildConversationSliceWithSummary(
      engine,
      history,
      userText,
      effectiveBudget,
    ),
    buildMemorySlice(
      engine,
      memory,
      userText,
      requestProfile,
      recentForProfile,
    ),
  ]);

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
    contextualHints,
    debug: {
      taskCategory,
      chosenHistoryCount: conversationMessages.length,
      memoryHitCount,
      memoryQueries,
      memoryCandidates,
      truncatedHistory,
      intent: requestProfile.intent,
      requiresFreshData: requestProfile.requiresFreshData,
      followUpDetected: requestProfile.followUpDetected,
    },
  };

  /* -------------------- 6) Planning messages ----------------------- */

  const messagesForPlanning = buildPlanningMessagesFromSlices(slices, userText);

  /* -------------------- 7) Answer messages ------------------------- */

  const messagesForAnswer = buildAnswerMessagesFromSlices(slices, userText);

  return {
    slices,
    messagesForPlanning,
    messagesForAnswer,
  };
}

/**
 * Rebuild context after fetching external evidence by calling buildContext anew.
 * This keeps history & memory selection consistent while injecting fresh evidence.
 */
export async function rebuildContextWithExternalEvidence(
  engine: MLCEngine,
  input: Omit<ContextBuildInput, "externalEvidence"> & {
    externalEvidence: string | null;
  },
): Promise<ContextBuildResult> {
  return buildContext(engine, {
    ...input,
    externalEvidence: input.externalEvidence,
  });
}
