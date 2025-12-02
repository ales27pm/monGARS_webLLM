import type { Config, Message, MLCEngine } from "./types";

export type TaskCategory =
  | "chitchat"
  | "evergreen_qa"
  | "coding"
  | "planning"
  | "needs_web"
  | "unknown";

export interface SemanticMemoryClient {
  enabled: boolean;
  search: (
    query: string,
    neighbors: number,
  ) => Promise<{
    context: string;
    results: {
      id: string;
      content: string;
      score: number;
      timestamp?: number | string;
    }[];
  }>;
}

export interface ContextBudget {
  totalTokens: number;
  systemTokens: number;
  planningTokens: number;
  answerTokens: number;
}

export interface ContextSlices {
  systemPrompt: string;
  conversationMessages: Message[];
  conversationSummary: string | null;
  memorySummary: string | null;
  memoryResults?: SemanticMemoryClient["search"] extends (
    query: string,
    neighbors: number,
  ) => Promise<infer R>
    ? R["results"]
    : never;
  externalContext: string | null;
  debug: {
    taskCategory: TaskCategory;
    chosenHistoryCount: number;
    memoryHitCount: number;
    truncated: boolean;
  };
}

export interface ContextBuildInput {
  userMessage: Message;
  history: Message[];
  config: Config;
  memory: SemanticMemoryClient | null;
  externalEvidence?: string | null;
  budget?: Partial<ContextBudget>;
}

export interface ContextBuildResult {
  slices: ContextSlices;
  messagesForPlanning: { role: string; content: string }[];
  messagesForAnswer: { role: string; content: string }[];
  budget: ContextBudget;
  userText: string;
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function classifyTaskHeuristic(text: string): TaskCategory {
  const lower = text.toLowerCase();

  if (lower.match(/\b(code|typescript|python|error|stack trace|exception)\b/)) {
    return "coding";
  }
  if (lower.match(/\b(plan|roadmap|steps|strategy)\b/)) {
    return "planning";
  }
  if (lower.match(/\b(today|now|current|latest|this year|2024|2025)\b/)) {
    return "needs_web";
  }
  if (lower.length < 40) {
    return "chitchat";
  }
  if (lower.match(/\b(why|how|explain|difference|compare)\b/)) {
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

  const recencyScore = 1 / (1 + idxFromEnd);
  score += 1.2 * recencyScore;

  if (msg.role === "user") score += 0.6;
  if (msg.role === "assistant") score += 0.4;
  if (msg.role === "tool") score += 0.2;

  const lower = (msg.content || "").toLowerCase();
  const qLower = query.toLowerCase();
  if (qLower.length > 0) {
    const overlap = qLower
      .split(/\s+/)
      .filter((w) => w.length > 3 && lower.includes(w)).length;
    score += 0.15 * overlap;
  }

  return score;
}

function selectHistoryUnderBudget(
  history: Message[],
  query: string,
  tokenBudget: number,
): { selected: Message[]; truncated: boolean } {
  const scored = history.map((msg, i) => {
    const idxFromEnd = history.length - 1 - i;
    return { msg, score: scoreHistoryMessage(msg, idxFromEnd, query), idx: i };
  });

  scored.sort((a, b) => b.score - a.score);

  const selected: { msg: Message; idx: number }[] = [];
  let usedTokens = 0;
  let truncated = false;

  for (const entry of scored) {
    const tokens = estimateTokens(entry.msg.content || "");
    if (usedTokens + tokens > tokenBudget) {
      truncated = true;
      break;
    }
    selected.push(entry);
    usedTokens += tokens;
  }

  const safeTimestamp = (value: Message["timestamp"]): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  selected.sort((a, b) => {
    const aTs = safeTimestamp(a.msg.timestamp);
    const bTs = safeTimestamp(b.msg.timestamp);

    if (aTs !== null && bTs !== null) return aTs - bTs;
    if (aTs !== null) return -1;
    if (bTs !== null) return 1;
    return a.idx - b.idx;
  });

  return { selected: selected.map((s) => s.msg), truncated };
}

async function summarizeMessages(
  engine: MLCEngine,
  messages: Message[],
  language: "fr" | "en" | "auto" = "fr",
  options?: { maxInputTokens?: number },
): Promise<string> {
  if (!messages.length) return "";

  const maxTokens = options?.maxInputTokens ?? 1200;
  const lines: string[] = [];
  let usedTokens = 0;

  for (const m of messages) {
    const line = `${m.role.toUpperCase()}: ${m.content}`;
    const tokens = estimateTokens(line);
    if (usedTokens + tokens > maxTokens) {
      break;
    }
    lines.push(line);
    usedTokens += tokens;
  }

  const joined = lines.join("\n");

  const localeHint =
    language === "auto"
      ? "Tu peux répondre en français ou en anglais selon le contenu."
      : language === "fr"
      ? "Réponds en français."
      : "Respond in English.";

  const prompt = `
Tu es un assistant qui crée des résumés extrêmement compacts pour aider un autre modèle à raisonner.

${localeHint}

Voici un extrait de conversation ou de notes:

---
${joined}
---

Ta tâche:
1. Résumer en 5–10 puces maximales.
2. Garder les infos factuelles importantes, les décisions, les contraintes.
3. Ne pas ajouter d'informations non présentes.
4. Être aussi concis que possible, sans perdre les points clés.
`;

  const result = await engine.chat.completions.create({
    messages: [
      { role: "system", content: "Tu es un expert en synthèse ultra-compacte." },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    max_tokens: 512,
    stream: false,
  });

  const content =
    (result as any).choices?.[0]?.message?.content ?? "[Résumé indisponible]";
  return typeof content === "string" ? content : JSON.stringify(content);
}

function computeEffectiveBudget(budget?: Partial<ContextBudget>): ContextBudget {
  return {
    totalTokens: budget?.totalTokens ?? 4096,
    systemTokens: budget?.systemTokens ?? 800,
    planningTokens: budget?.planningTokens ?? 1200,
    answerTokens: budget?.answerTokens ?? 2800,
  };
}

const buildSystemPrompt = () => `
Tu es "monGARS", un assistant IA local exécuté entièrement dans le navigateur via WebGPU.
Tu es:
- Rigoureux sur les faits.
- Transparent sur ce que tu sais / ne sais pas.
- Capable d'utiliser une mémoire sémantique et une recherche web (via un outil dédié) quand c'est utile.

Règles:
1. Tu expliques ton raisonnement de manière structurée mais sans rentrer dans des détails inutiles.
2. Tu mentionnes si tu t'appuies sur:
   - la conversation récente,
   - la mémoire à long terme,
   - des résultats de recherche externe.
3. Si tu n'es pas sûr, tu indiques clairement tes incertitudes.
4. Tu évites d'inventer des sources ou des références précises si tu ne les as pas.

Contexte fourni dans cette requête:
- [CONVERSATION] : extraits récents de la discussion.
- [MEMOIRE]      : résumé des éléments pertinents retrouvés dans la mémoire sémantique.
- [EXTERNE]      : informations provenant de recherches ou d'outils externes, si présentes.

Ta mission:
Répondre de la manière la plus utile possible à la question de l'utilisateur en tirant un maximum parti de ces blocs de contexte
`;

const computeHistoryBudget = (budget: ContextBudget) =>
  Math.max(200, Math.min(budget.answerTokens - 800, 2000));

const clampTextToBudget = (text: string, tokenBudget: number) => {
  let trimmed = text;
  while (estimateTokens(trimmed) > tokenBudget && trimmed.length > 0) {
    trimmed = trimmed.slice(0, Math.max(0, Math.floor(trimmed.length * 0.9)));
  }
  return trimmed || text.slice(0, Math.min(text.length, tokenBudget * 4));
};

async function buildConversationSlice(
  engine: MLCEngine,
  history: Message[],
  userText: string,
  budget: ContextBudget,
): Promise<{
  conversationMessages: Message[];
  conversationSummary: string | null;
  truncated: boolean;
}> {
  const historyBudgetTokens = computeHistoryBudget(budget);

  const { selected: selectedHistory, truncated } = selectHistoryUnderBudget(
    history,
    userText,
    historyBudgetTokens,
  );

  if (!(truncated && selectedHistory.length > 6)) {
    return {
      conversationMessages: selectedHistory,
      conversationSummary: null,
      truncated,
    };
  }

  const older = selectedHistory.slice(0, selectedHistory.length - 4);
  const recent = selectedHistory.slice(-4);
  const summary = await summarizeMessages(engine, older, "fr", {
    maxInputTokens: Math.max(256, Math.min(1200, budget.answerTokens - 600)),
  });

  return {
    conversationMessages: recent,
    conversationSummary: summary,
    truncated,
  };
}

async function buildMemorySlice(
  engine: MLCEngine,
  memory: SemanticMemoryClient | null,
  userText: string,
  budget: ContextBudget,
): Promise<{
  memorySummary: string | null;
  memoryHitCount: number;
  memoryResults: ContextSlices["memoryResults"];
}> {
  let memorySummary: string | null = null;
  let memoryHitCount = 0;
  let memoryResults: ContextSlices["memoryResults"];

  if (!memory || !memory.enabled) {
    return { memorySummary, memoryHitCount, memoryResults };
  }

  try {
    const neighborCount = Math.max(
      2,
      Math.min(8, Math.floor(budget.answerTokens / 512)),
    );

    const searchResult = await memory.search(userText, neighborCount);
    memoryResults = searchResult.results;
    memoryHitCount = searchResult.results.length;

    if (searchResult.results.length > 0) {
      const formatted = searchResult.results
        .map((r, idx) => `(${idx + 1}) ${r.content}`)
        .join("\n\n");

      const toSummarize = `
Elements mémoire pertinents (classés par similarité):

${formatted}
`;

      memorySummary = await summarizeMessages(
        engine,
        [
          {
            id: "memory",
            role: "user",
            content: toSummarize,
            timestamp: Date.now(),
          },
        ],
        "fr",
        { maxInputTokens: Math.max(256, Math.min(1200, budget.answerTokens - 600)) },
      );
    }
  } catch (err) {
    console.warn("[contextEngine] memory search failed:", err);
  }

  return { memorySummary, memoryHitCount, memoryResults };
}

const buildExternalContext = (externalEvidence: string | null) =>
  externalEvidence
    ? `Résultats d'outils externes (par ex. recherche web):\n\n${externalEvidence}`
    : null;

const buildContextBlocks = (
  conversationSummary: string | null,
  conversationMessages: Message[],
  memorySummary: string | null,
  externalContext: string | null,
) => {
  const convoBlock = conversationSummary
    ? `[Résumé conversation]\n${conversationSummary}\n\n`
    : "";

  const convoTurns = conversationMessages
    .map((m) =>
      `${m.role === "user" ? "Utilisateur" : m.role === "assistant" ? "Assistant" : "Outil"}: ${m.content}`,
    )
    .join("\n");

  const memoryBlock = memorySummary
    ? `\n[MEMOIRE]\n${memorySummary}\n`
    : "\n[MEMOIRE]\n(pas d'éléments mémoire particulièrement pertinents ou mémoire désactivée)\n";

  const externalBlock = externalContext
    ? `\n[EXTERNE]\n${externalContext}\n`
    : "\n[EXTERNE]\n(aucune information externe fournie pour cette requête)\n";

  return { convoBlock, convoTurns, memoryBlock, externalBlock };
};

const buildPlanningMessages = (
  systemPrompt: string,
  userText: string,
  conversationSummary: string | null,
  memorySummary: string | null,
  externalContext: string | null,
  planningTokenBudget: number,
) => {
  const planningContextTextParts: string[] = [];

  if (conversationSummary) {
    planningContextTextParts.push(
      "[Résumé de la conversation récente]\n" + conversationSummary,
    );
  }

  if (memorySummary) {
    planningContextTextParts.push("[Résumé mémoire]\n" + memorySummary);
  }

  if (externalContext) {
    planningContextTextParts.push("[Infos externes]\n" + externalContext);
  }

  const planningContextText = clampTextToBudget(
    planningContextTextParts.join("\n\n"),
    planningTokenBudget,
  );

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `
[CONTEXTE POUR PLANIFICATION]

${planningContextText || "(Pas de contexte supplémentaire disponible)"}

[QUESTION UTILISATEUR]
${userText}

Tâche:
1. Analyser la question.
2. Indiquer si tu dois appeler un outil (par ex. recherche web) ou non.
3. Proposer un plan de réponse (quelques étapes numérotées).
4. Retourner le tout en JSON strict avec cette forme:
{
  "action": "respond" | "search",
  "query": string | null,
  "plan": string,
  "rationale": string
}
`,
    },
  ];
};

const buildAnswerMessages = (
  systemPrompt: string,
  userText: string,
  conversationSummary: string | null,
  conversationMessages: Message[],
  memorySummary: string | null,
  externalContext: string | null,
) => {
  const { convoBlock, convoTurns, memoryBlock, externalBlock } =
    buildContextBlocks(
      conversationSummary,
      conversationMessages,
      memorySummary,
      externalContext,
    );

  return [
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
- Si tu n'as pas assez d'information, dis exactement ce qui manque.
- Donne une réponse structurée, claire, et adaptée au niveau de l'utilisateur.
`,
    },
  ];
};

function rebuildMessagesFromSlices(
  slices: ContextSlices,
  userText: string,
  budget: ContextBudget,
) {
  const planningMessages = buildPlanningMessages(
    slices.systemPrompt,
    userText,
    slices.conversationSummary,
    slices.memorySummary,
    slices.externalContext,
    budget.planningTokens,
  );

  const answerMessages = buildAnswerMessages(
    slices.systemPrompt,
    userText,
    slices.conversationSummary,
    slices.conversationMessages,
    slices.memorySummary,
    slices.externalContext,
  );

  return { planningMessages, answerMessages };
}

export async function buildContext(
  engine: MLCEngine,
  input: ContextBuildInput,
): Promise<ContextBuildResult> {
  const {
    userMessage,
    history,
    memory,
    config: _config,
    externalEvidence = null,
    budget,
  } = input;

  void _config;

  const effectiveBudget = computeEffectiveBudget(budget);
  const userText = userMessage.content || "";
  const taskCategory = classifyTaskHeuristic(userText);
  const systemPrompt = buildSystemPrompt();

  const { conversationMessages, conversationSummary, truncated } =
    await buildConversationSlice(engine, history, userText, effectiveBudget);

  const { memorySummary, memoryHitCount, memoryResults } =
    await buildMemorySlice(engine, memory, userText, effectiveBudget);

  const externalContext = buildExternalContext(externalEvidence);

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
      truncated,
    },
  };

  const { planningMessages, answerMessages } = rebuildMessagesFromSlices(
    slices,
    userText,
    effectiveBudget,
  );

  return {
    slices,
    messagesForPlanning: planningMessages,
    messagesForAnswer: answerMessages,
    budget: effectiveBudget,
    userText,
  };
}

export function rebuildContextWithExternalEvidence(
  previous: ContextBuildResult,
  externalEvidence: string | null,
): ContextBuildResult {
  const externalContext = buildExternalContext(externalEvidence);
  const updatedSlices: ContextSlices = {
    ...previous.slices,
    externalContext,
  };

  const { planningMessages, answerMessages } = rebuildMessagesFromSlices(
    updatedSlices,
    previous.userText,
    previous.budget,
  );

  return {
    slices: updatedSlices,
    messagesForPlanning: planningMessages,
    messagesForAnswer: answerMessages,
    budget: previous.budget,
    userText: previous.userText,
  };
}
