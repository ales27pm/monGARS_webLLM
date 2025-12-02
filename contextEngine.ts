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

  selected.sort((a, b) => a.timestamp - b.timestamp);
  return { selected, truncated };
}

async function summarizeMessages(
  engine: MLCEngine,
  messages: Message[],
  language: "fr" | "en" | "auto" = "fr",
): Promise<string> {
  if (!messages.length) return "";

  const joined = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

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

  const effectiveBudget: ContextBudget = {
    totalTokens: budget?.totalTokens ?? 4096,
    systemTokens: budget?.systemTokens ?? 800,
    planningTokens: budget?.planningTokens ?? 1200,
    answerTokens: budget?.answerTokens ?? 2800,
  };

  const userText = userMessage.content || "";
  const taskCategory = classifyTaskHeuristic(userText);

  const systemPrompt = `
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
Répondre de la manière la plus utile possible à la question de l'utilisateur en tirant un maximum parti de ces blocs de contexte.
`;

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
    const summary = await summarizeMessages(engine, older, "fr");
    conversationSummary = summary;
    conversationMessages = recent;
  }

  let memorySummary: string | null = null;
  let memoryHitCount = 0;
  let memoryResults: ContextSlices["memoryResults"];

  if (memory && memory.enabled) {
    try {
      const searchResult = await memory.search(
        userText,
        Math.max(2, Math.min(8, effectiveBudget.answerTokens / 512)),
      );
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

        memorySummary = await summarizeMessages(engine, [
          {
            id: "memory",
            role: "user",
            content: toSummarize,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch (err) {
      console.warn("[contextEngine] memory search failed:", err);
    }
  }

  const externalContext = externalEvidence
    ? `Résultats d'outils externes (par ex. recherche web):\n\n${externalEvidence}`
    : null;

  const slices: ContextSlices = {
    systemPrompt,
    conversationMessages,
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

  const planningContextText = planningContextTextParts.join("\n\n");

  const messagesForPlanning = [
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
- Si tu n'as pas assez d'information, dis exactement ce qui manque.
- Donne une réponse structurée, claire, et adaptée au niveau de l'utilisateur.
`,
    },
  ];

  return {
    slices,
    messagesForPlanning,
    messagesForAnswer,
  };
}
