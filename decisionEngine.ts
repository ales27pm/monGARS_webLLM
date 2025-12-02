import { z } from "zod";
import type { Config, Message, MLCEngine } from "./types";

export const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const MAX_CONTEXT_MESSAGES = 12;

type RequestProfile = {
  intent: "information" | "code" | "analysis";
  requiresFreshData: boolean;
  ambiguitySignals: string[];
  contextualAnchors: string[];
  followUpDetected: boolean;
};

export const ANSWER_GUARDRAILS = `Suis le plan, reste fidèle aux faits, aucune source inventée.
1) Résume ta stratégie en une phrase (obligatoire).
2) Donne la réponse finale en français clair et structurée.
3) Si tu utilises des sources, liste-les en fin de réponse (titre + URL).`;

export const DECISION_SYSTEM_PROMPT = `Tu es un orchestrateur de raisonnement qui choisit entre répondre directement ou
appeler l'outil de recherche.

Contraintes incontournables :
- Inspecte minutieusement la requête et le contexte (messages récents uniquement).
- Utilise les indices contextuels fournis pour éviter les hors-sujets et les refus injustifiés.
- Construis un plan Tree-of-Thought en au moins 3 étapes numérotées (diagnostic, pistes, validation).
- Choisis strictement entre "search" (si une actualité, une donnée récente ou un doute factuel existe) ou "respond".
- Si tu choisis "search", propose un "query" optimisé (5-12 mots, factuel, sans ponctuation superflue, pas d'anaphores).
- Si tu choisis "respond", produis immédiatement le champ "response" avec la réponse finale en français qui suit STRICTEMENT les garde-fous :
  ${ANSWER_GUARDRAILS}
- Capacité : l'outil de recherche fournit Internet, ne prétends JAMAIS en être privé sauf erreur réseau réelle.
- Code : si la demande concerne du code, fournis un extrait complet et exécutable avec les commandes d'installation et d'exécution.
- Sources : ne fabrique jamais de références ou de liens. Cite uniquement des ouvrages ou URLs réelles ou précise qu'aucune source fiable n'est disponible.
- Réponds UNIQUEMENT en JSON compact : {"action":"search|respond","query":"...","plan":"...","rationale":"...","response":"..."}.
- Ne mets jamais de Markdown ni de texte hors JSON dans les valeurs.`;

const DEFAULT_PLAN_STEPS = [
  "Analyser précisément la demande et le contexte récent.",
  "Décider si une recherche web est nécessaire ou si une réponse directe suffit.",
  "Valider les faits et structurer la réponse finale en français clair.",
];

const CONTEXT_STOP_WORDS = new Set(
  [
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "du",
    "de",
    "et",
    "ou",
    "en",
    "pour",
    "dans",
    "avec",
    "sur",
    "par",
    "que",
    "qui",
    "quoi",
    "quand",
    "comment",
    "est",
    "sont",
    "été",
    "être",
    "au",
    "aux",
    "ce",
    "cet",
    "cette",
    "ces",
    "ton",
    "son",
    "mon",
    "ma",
    "mes",
    "tes",
    "ses",
    "leurs",
    "leur",
  ].map((entry) => entry.toLowerCase()),
);

const INTENT_PATTERNS: Array<{
  intent: RequestProfile["intent"];
  regex: RegExp;
}> = [
  {
    intent: "code",
    regex: /(code|exemple|snippet|impl[eé]mentation|fonction)/i,
  },
  {
    intent: "analysis",
    regex: /(analy[st]e|comparaison|diagnostic|synth[eè]se)/i,
  },
];

const FRESHNESS_PATTERNS = [
  /\baujourd'hui|today|maintenant|actuel(le)?|en\s+direct/i,
  /\bdernier(e)?s?\s+(chiffres|statistiques|mises?\s+à\s+jour)/i,
  /\b202[3-9]|202\d\b/, // explicit recent year hints
];

const FOLLOW_UP_PATTERNS = [/comme (pr[eé]c[eé]dent|avant)/i, /encore|suite/i];

const stripListPrefix = (entry: string) =>
  entry.replace(/^[-*\d.)\s]+/, "").trim();

const extractKeywords = (text: string, maxKeywords = 6) => {
  const tokens =
    text
      ?.normalize("NFKD")
      .toLowerCase()
      .match(/\p{L}{4,}/gu) || [];

  const freq = new Map<string, number>();
  for (const token of tokens) {
    if (CONTEXT_STOP_WORDS.has(token)) continue;
    freq.set(token, (freq.get(token) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
};

const buildRequestProfile = (
  inputText: string,
  recentHistory: Message[],
): RequestProfile => {
  const combined = [
    inputText,
    ...recentHistory.map((m) => m.content || ""),
  ].join("\n");
  const requiresFreshData = FRESHNESS_PATTERNS.some((regex) =>
    regex.test(combined),
  );
  const followUpDetected = FOLLOW_UP_PATTERNS.some((regex) =>
    regex.test(inputText),
  );

  const intentMatch = INTENT_PATTERNS.find((pattern) =>
    pattern.regex.test(combined),
  );
  const intent = intentMatch?.intent || "information";

  const ambiguitySignals = [] as string[];
  if (/ça|cela|c[e'`]est/i.test(inputText) && recentHistory.length > 0) {
    ambiguitySignals.push('Référence pronominale détectée ("ça", "cela").');
  }
  if (followUpDetected) {
    ambiguitySignals.push("Demande de suivi implicite, vérifier l'antécédent.");
  }

  const contextualAnchors = extractKeywords(
    [
      inputText,
      ...recentHistory
        .slice(-4)
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => m.content || ""),
    ].join(" "),
  );

  return {
    intent,
    requiresFreshData,
    ambiguitySignals,
    contextualAnchors,
    followUpDetected,
  };
};

const formatContextualHints = (profile: RequestProfile) => {
  const intentLabel =
    profile.intent === "code"
      ? "code / exemple exécutable"
      : profile.intent === "analysis"
        ? "analyse ou comparaison"
        : "information";

  const freshnessLabel = profile.requiresFreshData
    ? "Oui (signaux de fraîcheur détectés)"
    : "Non (connaissances stables suffisantes)";

  const followUpLabel = profile.followUpDetected
    ? "Oui (penser à rappeler le contexte précédent)."
    : "Non";

  const anchors = profile.contextualAnchors.join(", ") || "non détectés";
  const ambiguities =
    profile.ambiguitySignals.length > 0
      ? profile.ambiguitySignals.join(" | ")
      : "Aucune ambiguïté explicite détectée.";

  return (
    `- Intent principal: ${intentLabel}\n` +
    `- Besoin de données fraîches: ${freshnessLabel}\n` +
    `- Continuité / suivi: ${followUpLabel}\n` +
    `- Ambiguïtés à lever: ${ambiguities}\n` +
    `- Ancrages contextuels: ${anchors}`
  );
};

const normalizePlan = (plan?: string) => {
  const candidate = plan?.trim();
  if (!candidate) {
    return DEFAULT_PLAN_STEPS.map((step, idx) => `${idx + 1}) ${step}`).join(
      "\n",
    );
  }

  const normalizedSeparators = candidate.replace(/\r\n/g, "\n");
  const rawSteps = normalizedSeparators
    .split(/\s*(?:\n|;|\||\d+[.)])\s*/)
    .map((entry) => stripListPrefix(entry))
    .filter(Boolean);
  const totalSteps = Math.max(
    3,
    Math.min(6, rawSteps.length || DEFAULT_PLAN_STEPS.length),
  );

  const steps: string[] = [];
  for (let i = 0; i < totalSteps; i++) {
    const content = rawSteps[i] || DEFAULT_PLAN_STEPS[i] || "Étape";
    steps.push(`${i + 1}) ${content}`);
  }

  return steps.join("\n");
};

const decisionSchema = z.object({
  action: z.enum(["search", "respond"]).catch("respond"),
  query: z
    .string()
    .trim()
    .min(3, "query trop courte")
    .max(160, "query trop longue")
    .optional(),
  plan: z.string().trim().min(8, "plan manquant").optional(),
  rationale: z.string().trim().min(6, "justification manquante").optional(),
  response: z.string().trim().optional(),
});

const formatConversationContext = (history: Message[]) =>
  history
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
    .join("\n");

export const stripJson = (raw: string) => {
  if (!raw) return null;

  const fenceMatch =
    raw.match(/```json([\s\S]*?)```/i) || raw.match(/```([\s\S]*?)```/i);
  const target = (fenceMatch ? fenceMatch[1] : raw).trim();

  const start = target.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < target.length; i++) {
    const ch = target[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }

  if (end === -1) return null;

  let candidate = target.slice(start, end);
  candidate = candidate.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
};

export type DecisionResult = {
  action: "search" | "respond";
  query?: string;
  plan: string;
  rationale: string;
  response?: string;
  warnings: string[];
};

const formatZodIssues = (issues: z.ZodIssue[]) =>
  issues
    .map((issue) =>
      [issue.path?.join("."), issue.message].filter(Boolean).join(" → "),
    )
    .filter(Boolean)
    .join(" | ");

const countPlanSteps = (plan: string) =>
  plan
    .split(/\n+/)
    .map((step) => step.trim())
    .filter(Boolean).length;

export const normalizeDecision = (raw: string): DecisionResult => {
  const parsed = stripJson(raw) || {};
  const decision = decisionSchema.safeParse(parsed);
  const warnings: string[] = [];

  if (decision.success) {
    const normalizedQuery = decision.data.query?.trim();
    const normalizedResponse = decision.data.response?.trim();
    const normalizedPlan = normalizePlan(decision.data.plan);
    const providedPlan = decision.data.plan?.trim() || "";
    const providedRationale = decision.data.rationale?.trim();

    if (!decision.data.plan) {
      warnings.push(
        "Plan complété par défaut (absent dans la réponse du modèle).",
      );
    } else {
      const providedStepCount = countPlanSteps(providedPlan);
      if (providedStepCount < 3) {
        warnings.push(
          `Plan Tree-of-Thought insuffisant (${providedStepCount}/3 étapes), complété automatiquement.`,
        );
      }
      if (providedPlan !== normalizedPlan) {
        warnings.push(
          "Plan reformatté pour respecter les garde-fous ToT (3-6 étapes).",
        );
      }
    }

    if (!providedRationale) {
      warnings.push("Justification absente, complétée par défaut.");
    }

    const normalized = {
      action: decision.data.action,
      plan: normalizedPlan,
      rationale: decision.data.rationale?.trim(),
      query: normalizedQuery,
      response: normalizedResponse,
    };
    const hasQuery = !!normalizedQuery;
    const hasResponse = !!normalizedResponse;

    let { action } = decision.data;

    // If the model intends to search but provides no query, switch to respond.
    // If it intends to respond but provides no response, switch to search.
    if (action === "search" && !hasQuery) {
      action = "respond";
      warnings.push(
        "Action inversée en respond faute de requête de recherche.",
      );
    } else if (action === "respond" && !hasResponse) {
      action = "search";
      warnings.push("Action inversée en search faute de réponse finale.");
    }

    const wantsSearch = action === "search" && hasQuery;
    const finalAction: "search" | "respond" = wantsSearch
      ? "search"
      : "respond";

    if (finalAction === "respond" && hasQuery) {
      warnings.push(
        "Requête de recherche fournie mais action respond retenue.",
      );
    }
    if (finalAction === "search" && hasResponse) {
      warnings.push(
        "Réponse finale fournie mais ignorée car l'action est search.",
      );
    }

    return {
      action: finalAction,
      query: finalAction === "search" ? normalized.query : undefined,
      plan: normalized.plan,
      rationale:
        normalized.rationale ||
        (finalAction === "search"
          ? "Recherche requise pour données fraîches."
          : "Réponse directe appropriée."),
      response: finalAction === "respond" ? normalized.response : undefined,
      warnings,
    } satisfies DecisionResult;
  }

  warnings.push("Échec de parsing JSON, utilisation d'un fallback tolérant.");

  if (!decision.success && decision.error.issues.length > 0) {
    warnings.push(
      `Détails de validation : ${formatZodIssues(decision.error.issues)}`,
    );
  }

  const fallbackAction = /search/i.test(raw) ? "search" : "respond";
  const fallbackQueryMatch = raw.match(/query\s*[:=]\s*"?([^"}]+)"?/i);
  const fallbackResponseMatch = raw.match(
    /response\s*[:=]\s*"?([^}]+?)"?\s*(?:,|$)/i,
  );

  if (!fallbackQueryMatch && fallbackAction === "search") {
    warnings.push(
      "Aucune requête trouvée dans le fallback, action search potentiellement invalide.",
    );
  }
  if (!fallbackResponseMatch && fallbackAction === "respond") {
    warnings.push(
      "Aucune réponse trouvée dans le fallback, action respond potentiellement invalide.",
    );
  }

  return {
    action: fallbackAction as "search" | "respond",
    query: fallbackQueryMatch?.[1]?.trim() || undefined,
    plan: normalizePlan(),
    rationale: "Fallback décision non structurée.",
    response: fallbackResponseMatch?.[1]?.trim(),
    warnings,
  } satisfies DecisionResult;
};

export const buildDecisionMessages = (
  inputText: string,
  recentHistory: Message[],
  toolSpecPrompt: string,
) => {
  const profile = buildRequestProfile(inputText, recentHistory);
  const contextualHints = formatContextualHints(profile);

  return [
    { role: "system", content: DECISION_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Requête utilisateur:\n${inputText}\n\n` +
        `Historique récent (du plus ancien au plus récent):\n${formatConversationContext(recentHistory)}\n\n` +
        `Profil contextuel à exploiter sans l'ignorer:\n${contextualHints}\n\n` +
        `Outil disponible: ${toolSpecPrompt}\n` +
        `Choisis entre search ou respond, fournis un plan ToT avec au moins 3 puces. Si tu réponds directement, mets la réponse finale dans "response" et respecte les garde-fous.`,
    },
  ];
};

export const buildAnswerHistory = (
  decisionPlan: string,
  config: Config,
  messages: Message[],
  userContent: string,
) => [
  {
    role: "system",
    content: `${config.systemPrompt}\n\n${ANSWER_GUARDRAILS}\nPlan: ${decisionPlan}`,
  },
  ...messages.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: m.content,
  })),
  { role: "user", content: userContent },
];

export async function decideAction(
  engine: MLCEngine,
  inputText: string,
  history: Message[],
  toolSpecPrompt: string,
  signal?: AbortSignal,
): Promise<DecisionResult> {
  const recentHistory = history.slice(-MAX_CONTEXT_MESSAGES);
  const decisionMessages = buildDecisionMessages(
    inputText,
    recentHistory,
    toolSpecPrompt,
  );

  const decisionCompletion = await engine.chat.completions.create({
    messages: decisionMessages,
    temperature: 0.2,
    max_tokens: 256,
    stream: false,
    signal,
  });

  const rawDecision =
    decisionCompletion.choices[0]?.message?.content?.trim() ?? "";
  return normalizeDecision(rawDecision);
}
