import { z } from "zod";
import { buildContextualHints } from "./contextProfiling";
import { buildContext } from "./contextEngine";
import type { ContextBuildResult, SemanticMemoryClient } from "./contextEngine";
import type { Config, Message, MLCEngine } from "./types";
import { DEFAULT_MODEL_ID } from "./models";

export const MODEL_ID = DEFAULT_MODEL_ID;
export const MAX_CONTEXT_MESSAGES = 12;

const MIN_FALLBACK_QUERY_LENGTH = 4;
const MAX_FALLBACK_QUERY_LENGTH = 160;

const buildFallbackSearchQuery = (
  text?: string | null,
  maxLength = MAX_FALLBACK_QUERY_LENGTH,
) => {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length < MIN_FALLBACK_QUERY_LENGTH) return null;

  return normalized.slice(0, maxLength);
};

const extractQuestionForFallback = (content?: string | null) => {
  if (!content) return null;

  const marker = "[QUESTION UTILISATEUR]";
  const markerIndex = content.indexOf(marker);
  const candidate =
    markerIndex >= 0 ? content.slice(markerIndex + marker.length) : content;

  const questionOnly = candidate.split(/\n\s*Tâche:/)[0] ?? candidate;

  return questionOnly.trim();
};

const SAFETY_INTENT_CHECK =
  "Vérifie sécurité/intention : réponds aux sujets informatifs grand public (ex. chiens de traîneau, météo locale, fonctionnement d'un produit courant) quand aucune action nuisible n'est demandée; refuse clairement si l'utilisateur cherche à fabriquer/utiliser des armes, malwares, contournements de sécurité ou toute aide dangereuse.";

export const ANSWER_GUARDRAILS = `Suis le plan, reste fidèle aux faits, aucune source inventée.
1) Résume ta stratégie en une phrase (obligatoire).
2) ${SAFETY_INTENT_CHECK}
3) Explique ta capacité : précise si tu réponds hors ligne ou avec recherche web (ou pourquoi elle n'est pas utilisée).
4) Donne la réponse finale en français clair et structurée (3-6 puces ou paragraphes courts).
5) Ajoute UNE question de clarification UTILE seulement si la demande est ouverte ou multi-étapes et que des zones d'ombre subsistent, après avoir déjà fourni des infos utiles.
6) Si tu utilises des sources, liste-les en fin de réponse (titre + URL).`;

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
  SAFETY_INTENT_CHECK,
  "Décider recherche vs réponse directe selon le besoin de données fraîches ou la confiance factuelle.",
  "Structurer la réponse en français clair, mentionner la capacité (hors ligne / recherche) et proposer approfondissements utiles.",
];

/**
 * Removes a single leading list marker (optional blockquote `>` followed by
 * an ordered marker like `1.` or `2)` or an unordered marker `-`, `*`, `+`,
 * or `•`), along with the following whitespace.
 */
export const stripListPrefix = (entry: string) =>
  entry.replace(/^\s*>?\s*(?:\d+[.)]|[-*+\u2022])\s+/, "").trim();

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
  diagnostics: {
    source: NormalizationMeta["source"];
    parsingIssueSummary?: string;
    hadPlan: boolean;
    hadRationale: boolean;
    actionBeforeSwitch?: NormalizationMeta["actionBeforeSwitch"];
    actionAfterSwitch: NormalizationMeta["actionAfterSwitch"];
    finalAction: NormalizationMeta["finalAction"];
    actionFlip?: NormalizationMeta["actionFlip"];
    hasQuery: boolean;
    hasResponse: boolean;
    responseMissing?: boolean;
    responseMissingReason?: string;
    responseRecovered?: boolean;
    planSuggestedAction?: NormalizationMeta["planSuggestedAction"];
    rationaleSuggestedAction?: NormalizationMeta["rationaleSuggestedAction"];
  };
};

export type DecisionDiagnostics = DecisionResult["diagnostics"];

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

type NormalizationMeta = {
  raw: string;
  source: "validated" | "fallback";
  parsingIssues?: z.ZodIssue[];
  providedPlan?: string;
  providedStepCount?: number;
  planReformatted?: boolean;
  hadPlan: boolean;
  hadRationale: boolean;
  actionBeforeSwitch?: "search" | "respond";
  actionAfterSwitch: "search" | "respond";
  finalAction: "search" | "respond";
  actionFlip?: "searchToRespond" | "respondToSearch";
  hasQuery: boolean;
  hasResponse: boolean;
  responseMissing?: boolean;
  responseMissingReason?: string;
  responseRecovered?: boolean;
  fallbackQueryMissing?: boolean;
  fallbackResponseMissing?: boolean;
  planSuggestedAction?: "search" | "respond";
  rationaleSuggestedAction?: "search" | "respond";
};

const recoverLooseResponse = (raw: string): string | undefined => {
  if (!raw.trim()) return undefined;

  const jsonMatch = raw.match(/"response"\s*:\s*"([\s\S]*?)"\s*[},]/i);
  if (jsonMatch?.[1]?.trim()) {
    return jsonMatch[1].trim();
  }

  const looseMatch = raw.match(/response\s*[:=]\s*([^\n{}]+)/i);
  return looseMatch?.[1]?.trim();
};

const detectActionHint = (
  value?: string,
): NormalizationMeta["planSuggestedAction"] => {
  if (!value?.trim()) return undefined;

  const normalized = value.toLowerCase();
  const normalizedAscii = normalized
    .normalize("NFD")
    .replace(/[^\p{ASCII}]/gu, "")
    .replace(/[\u0300-\u036f]/g, "");
  const searchHints = [
    "recherche",
    "chercher",
    "source",
    "actualit",
    "actualite",
    "donnée fraîche",
    "donnee fraiche",
    "donnees recentes",
    "mises a jour",
    "mise a jour",
    "mises à jour",
    "mise à jour",
    "source récente",
    "source recente",
    "donnees fraiches",
    "donnee fraiche",
    "donnees du mois",
    "derniers chiffres",
    "ce mois-ci",
    "mise a jour recente",
    "mise à jour récente",
    "donnée recente",
    "donnee recente",
  ];
  const respondHints = [
    "répondre",
    "réponse directe",
    "synthèse",
    "rédiger",
    "sans chercher",
    "sans recherche",
    "réponds directement",
    "reponds directement",
    "déjà les infos",
    "deja les infos",
  ];

  if (searchHints.some((hint) => normalized.includes(hint))) {
    return "search";
  }
  if (searchHints.some((hint) => normalizedAscii.includes(hint))) {
    return "search";
  }
  if (respondHints.some((hint) => normalized.includes(hint))) {
    return "respond";
  }

  return undefined;
};

const normalizeDecisionCore = (
  raw: string,
): { result: Omit<DecisionResult, "warnings">; meta: NormalizationMeta } => {
  const parsedJson = stripJson(raw);
  const parsed = parsedJson || {};
  const parsedFromJson = !!parsedJson;
  const decision = decisionSchema.safeParse(parsed);
  const shouldFallback =
    !parsedFromJson && (!decision.success || Object.keys(parsed).length === 0);

  if (decision.success && !shouldFallback) {
    const normalizedQuery = decision.data.query?.trim();
    const normalizedResponse =
      decision.data.response?.trim() || recoverLooseResponse(raw);
    const normalizedPlan = normalizePlan(decision.data.plan);
    const providedPlan = decision.data.plan?.trim() || "";
    const providedRationale = decision.data.rationale?.trim();

    let action = decision.data.action;
    let actionFlip: NormalizationMeta["actionFlip"];
    let responseMissing = false;
    let responseMissingReason: NormalizationMeta["responseMissingReason"];
    let responseRecovered = false;

    // If the model intends to search but provides no query, switch to respond.
    // For respond without a response, keep respond and let the answering pipeline
    // generate the final message to avoid unnecessary searches.
    if (action === "search" && !normalizedQuery) {
      action = "respond";
      actionFlip = "searchToRespond";
    }

    const wantsSearch = action === "search" && !!normalizedQuery;
    const finalAction: "search" | "respond" = wantsSearch
      ? "search"
      : "respond";

    const hadResponseField = Object.prototype.hasOwnProperty.call(
      parsed,
      "response",
    );

    if (finalAction === "respond" && !normalizedResponse) {
      responseMissing = true;
      responseMissingReason = hadResponseField
        ? "Champ response vide dans le JSON du modèle."
        : "Champ response absent de la sortie du modèle.";
    } else if (
      finalAction === "respond" &&
      !decision.data.response &&
      normalizedResponse
    ) {
      responseRecovered = true;
    }

    const result: Omit<DecisionResult, "warnings"> = {
      action: finalAction,
      query: finalAction === "search" ? normalizedQuery : undefined,
      plan: normalizedPlan,
      rationale:
        providedRationale ||
        (finalAction === "search"
          ? "Recherche requise pour données fraîches."
          : "Réponse directe appropriée."),
      response: finalAction === "respond" ? normalizedResponse : undefined,
    } satisfies Omit<DecisionResult, "warnings">;

    const planSuggestedAction = detectActionHint(providedPlan);
    const rationaleSuggestedAction = detectActionHint(providedRationale);

    const meta: NormalizationMeta = {
      raw,
      source: "validated",
      parsingIssues: [],
      providedPlan,
      providedStepCount: providedPlan
        ? countPlanSteps(providedPlan)
        : undefined,
      planReformatted: !!providedPlan && providedPlan !== normalizedPlan,
      hadPlan: !!providedPlan,
      hadRationale: !!providedRationale,
      actionBeforeSwitch: decision.data.action,
      actionAfterSwitch: action,
      finalAction,
      actionFlip,
      hasQuery: !!normalizedQuery,
      hasResponse: !!normalizedResponse,
      responseMissing,
      responseMissingReason,
      responseRecovered,
      planSuggestedAction,
      rationaleSuggestedAction,
    };

    return { result, meta };
  }

  const fallbackAction = /search/i.test(raw) ? "search" : "respond";
  const fallbackQueryMatch = raw.match(/query\s*[:=]\s*"?([^"}]+)"?/i);
  const fallbackResponseMatch = raw.match(
    /response\s*[:=]\s*"?([^}]+?)"?\s*(?:,|$)/i,
  );

  const fallbackPlan = raw.match(/plan\s*[:=]\s*([^\n]+)/i)?.[1];
  const fallbackRationale = raw.match(/rationale\s*[:=]\s*([^\n]+)/i)?.[1];

  const normalizedFallbackPlan = normalizePlan(fallbackPlan);
  const normalizedFallbackRationale = fallbackRationale
    ? stripListPrefix(fallbackRationale)
    : undefined;

  const result: Omit<DecisionResult, "warnings"> = {
    action: fallbackAction as "search" | "respond",
    query: fallbackQueryMatch?.[1]?.trim() || undefined,
    plan: normalizedFallbackPlan,
    rationale:
      normalizedFallbackRationale ||
      (fallbackAction === "search"
        ? "JSON invalide : bascule vers la recherche avec sauvegarde des champs disponibles."
        : "JSON invalide : réponse directe issue de la sortie non structurée."),
    response: fallbackResponseMatch?.[1]?.trim(),
  } satisfies Omit<DecisionResult, "warnings">;

  const meta: NormalizationMeta = {
    raw,
    source: "fallback",
    parsingIssues: decision.success ? [] : decision.error.issues,
    providedStepCount: fallbackPlan ? countPlanSteps(normalizedFallbackPlan) : undefined,
    planReformatted: !!fallbackPlan && fallbackPlan.trim() !== normalizedFallbackPlan,
    hadPlan: !!fallbackPlan?.trim(),
    hadRationale: !!normalizedFallbackRationale,
    actionAfterSwitch: fallbackAction as "search" | "respond",
    finalAction: fallbackAction as "search" | "respond",
    hasQuery: !!fallbackQueryMatch?.[1]?.trim(),
    hasResponse: !!fallbackResponseMatch?.[1]?.trim(),
    responseMissing:
      fallbackAction === "respond" && !fallbackResponseMatch?.[1]?.trim(),
    responseMissingReason:
      fallbackAction === "respond" && !fallbackResponseMatch?.[1]?.trim()
        ? "Réponse absente dans la sortie non structurée du modèle."
        : undefined,
    fallbackQueryMissing:
      fallbackAction === "search" && !fallbackQueryMatch?.[1]?.trim(),
    fallbackResponseMissing:
      fallbackAction === "respond" && !fallbackResponseMatch?.[1]?.trim(),
    planSuggestedAction: detectActionHint(fallbackPlan),
    rationaleSuggestedAction: detectActionHint(fallbackRationale),
  };

  return { result, meta };
};

const buildDecisionWarnings = (meta: NormalizationMeta): string[] => {
  if (meta.source === "fallback") {
    const warnings = [
      "Échec de parsing JSON, utilisation d'un fallback tolérant.",
    ];

    if (meta.parsingIssues && meta.parsingIssues.length > 0) {
      warnings.push(
        `Détails de validation : ${formatZodIssues(meta.parsingIssues)}`,
      );
    }
    if (meta.fallbackQueryMissing) {
      warnings.push(
        "Aucune requête trouvée dans le fallback, action search potentiellement invalide.",
      );
    }
    if (meta.fallbackResponseMissing) {
      warnings.push(
        "Aucune réponse trouvée dans le fallback, action respond potentiellement invalide.",
      );
    }

    if (
      meta.planSuggestedAction &&
      meta.planSuggestedAction !== meta.finalAction
    ) {
      warnings.push(
        `Plan suggère ${meta.planSuggestedAction} mais action ${meta.finalAction} retenue.`,
      );
    }
    if (
      meta.rationaleSuggestedAction &&
      meta.rationaleSuggestedAction !== meta.finalAction
    ) {
      warnings.push(
        `Justification suggère ${meta.rationaleSuggestedAction} mais action ${meta.finalAction} retenue.`,
      );
    }

    return warnings;
  }

  const warnings: string[] = [];

  if (!meta.hadPlan) {
    warnings.push(
      "Plan complété par défaut (absent dans la réponse du modèle).",
    );
  } else {
    if ((meta.providedStepCount ?? 0) < 3) {
      warnings.push(
        `Plan Tree-of-Thought insuffisant (${meta.providedStepCount}/3 étapes), complété automatiquement.`,
      );
    }
    if (meta.planReformatted) {
      warnings.push(
        "Plan reformatté pour respecter les garde-fous ToT (3-6 étapes).",
      );
    }
  }

  if (!meta.hadRationale) {
    warnings.push("Justification absente, complétée par défaut.");
  }

  if (meta.finalAction === "respond" && meta.responseMissing) {
    warnings.push(
      meta.responseMissingReason
        ? `Réponse finale absente : ${meta.responseMissingReason}`
        : "Réponse finale absente, génération via le pipeline de réponse directe.",
    );
  }

  if (meta.responseRecovered) {
    warnings.push(
      "Réponse récupérée à partir du texte non structuré du modèle (hors JSON).",
    );
  }

  if (meta.actionFlip === "searchToRespond") {
    warnings.push("Action inversée en respond faute de requête de recherche.");
  } else if (meta.actionFlip === "respondToSearch") {
    warnings.push("Action inversée en search faute de réponse finale.");
  }

  if (meta.finalAction === "respond" && meta.hasQuery) {
    warnings.push("Requête de recherche fournie mais action respond retenue.");
  }
  if (meta.finalAction === "search" && meta.hasResponse) {
    warnings.push(
      "Réponse finale fournie mais ignorée car l'action est search.",
    );
  }

  if (
    meta.finalAction === "respond" &&
    !meta.hasQuery &&
    (meta.planSuggestedAction === "search" ||
      meta.rationaleSuggestedAction === "search")
  ) {
    warnings.push(
      "Recherche requise mais requête de recherche absente, action respond conservée.",
    );
  }

  if (
    meta.planSuggestedAction &&
    meta.planSuggestedAction !== meta.finalAction
  ) {
    warnings.push(
      `Plan suggère ${meta.planSuggestedAction} mais action ${meta.finalAction} retenue.`,
    );
  }
  if (
    meta.rationaleSuggestedAction &&
    meta.rationaleSuggestedAction !== meta.finalAction
  ) {
    warnings.push(
      `Justification suggère ${meta.rationaleSuggestedAction} mais action ${meta.finalAction} retenue.`,
    );
  }

  return warnings;
};

export const normalizeDecision = (raw: string): DecisionResult => {
  const { result, meta } = normalizeDecisionCore(raw);
  const warnings = buildDecisionWarnings(meta);
  const diagnostics: DecisionResult["diagnostics"] = {
    source: meta.source,
    parsingIssueSummary: meta.parsingIssues
      ?.map((issue) => issue.message)
      .join(" | "),
    hadPlan: meta.hadPlan,
    hadRationale: meta.hadRationale,
    actionBeforeSwitch: meta.actionBeforeSwitch,
    actionAfterSwitch: meta.actionAfterSwitch,
    finalAction: meta.finalAction,
    actionFlip: meta.actionFlip,
    hasQuery: meta.hasQuery,
    hasResponse: meta.hasResponse,
    responseMissing: meta.responseMissing,
    responseMissingReason: meta.responseMissingReason,
    responseRecovered: meta.responseRecovered,
    planSuggestedAction: meta.planSuggestedAction,
    rationaleSuggestedAction: meta.rationaleSuggestedAction,
  };

  return { ...result, warnings, diagnostics } satisfies DecisionResult;
};

export type NextActionDecision = {
  action: "respond" | "search";
  query: string | null;
  plan: string;
  rationale: string;
  diagnostics: DecisionDiagnostics;
  trace: DecisionTrace;
  debugContext: ContextBuildResult["slices"]["debug"];
  context: ContextBuildResult;
  notes: string[];
};

export type DecisionHints = {
  freshDataHint?: string | null;
};

const formatToolSpecPrompt = (config: Config) => {
  const searchBase = config.searchApiBase || "https://api.duckduckgo.com";
  const providerLabel = `Recherche web DuckDuckGo via ${searchBase}`;

  return config.toolSearchEnabled
    ? `${providerLabel} (GET ?q=...&format=json&no_html=1). Utilise search pour les données récentes, sinon réponds directement.`
    : "Recherche web désactivée pour cette session; choisis respond sauf indication explicite contraire.";
};

export const buildDecisionPrompt = (
  inputText: string,
  recentHistory: Message[],
  toolSpecPrompt: string,
  hints?: DecisionHints,
) => {
  const contextualHints = buildContextualHints(inputText, recentHistory);
  const freshDataLine = hints
    ? hints.freshDataHint
      ? `Indice automatique (à valider) suggérant un besoin potentiel de données fraîches : "${hints.freshDataHint}". Ne l'applique que si pertinent.`
      : "Indice automatique : aucun besoin de données fraîches détecté."
    : "Indice automatique : aucune détection automatique fournie.";

  const messages = [
    { role: "system", content: DECISION_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Requête utilisateur:\n${inputText}\n\n` +
        `Historique récent (du plus ancien au plus récent):\n${formatConversationContext(recentHistory)}\n\n` +
        `Profil contextuel à exploiter sans l'ignorer:\n${contextualHints}\n\n` +
        `${freshDataLine}\n` +
        `Outil disponible: ${toolSpecPrompt}\n` +
        `Choisis entre search ou respond, fournis un plan ToT avec au moins 3 puces. Si tu réponds directement, mets la réponse finale dans "response" et respecte les garde-fous.`,
    },
  ];

  return { messages, contextualHints, freshDataLine };
};

export const buildDecisionMessages = (
  inputText: string,
  recentHistory: Message[],
  toolSpecPrompt: string,
  hints?: DecisionHints,
) => buildDecisionPrompt(inputText, recentHistory, toolSpecPrompt, hints).messages;

export const buildAnswerHistory = (
  decisionPlan: string,
  config: Config,
  messages: Message[],
  userContent: string,
) => [
  {
    role: "system",
    content: `${config.systemPrompt ?? ""}\n\n${ANSWER_GUARDRAILS}\nPlan: ${decisionPlan}`,
  },
  ...messages.map((m) => ({
    role: m.role === "tool" ? "assistant" : m.role,
    content: m.content,
  })),
  { role: "user", content: userContent },
];

const normalizeModelJsonOutput = (output: unknown): string => {
  const text =
    typeof output === "string" ? output : JSON.stringify(output ?? "");

  let cleaned = text.trim();

  const fenceMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    let startIndex = -1;

    if (firstBrace !== -1 && firstBracket !== -1) {
      startIndex = Math.min(firstBrace, firstBracket);
    } else if (firstBrace !== -1) {
      startIndex = firstBrace;
    } else if (firstBracket !== -1) {
      startIndex = firstBracket;
    }

    if (startIndex !== -1) {
      cleaned = cleaned.slice(startIndex);
    }
  }

  const objectMatch = cleaned.match(/(\{[\s\S]*\})/);
  const arrayMatch = cleaned.match(/(\[[\s\S]*\])/);
  const candidate = objectMatch?.[1] ?? arrayMatch?.[1];

  return (candidate ?? cleaned).trim();
};

export type DecisionTrace = {
  decisionMessages: { role: string; content: string | null }[];
  modelRawDecision: string;
  normalizedDecision: DecisionResult;
  contextualHints: string;
  freshDataLine: string;
};

export async function decideNextActionFromMessages(
  engine: MLCEngine,
  messagesForPlanning: { role: string; content: string }[],
  toolSpecPrompt: string,
  freshDataHint?: string | null,
  signal?: AbortSignal,
): Promise<{
  action: "respond" | "search";
  query: string | null;
  plan: string;
  rationale: string;
  notes: string[];
  diagnostics: DecisionResult["diagnostics"];
  trace: DecisionTrace;
}> {
  const planningUserMessage = [...messagesForPlanning]
    .reverse()
    .find((msg) => msg.role === "user");

  const planningContent = planningUserMessage?.content;
  const planningQuestion = extractQuestionForFallback(planningContent);
  const planningHistory = messagesForPlanning
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((msg) => ({ role: msg.role, content: msg.content }));

  const decisionPrompt = buildDecisionPrompt(
    planningContent || "",
    planningHistory,
    toolSpecPrompt,
    freshDataHint ? { freshDataHint } : undefined,
  );

  const decisionCompletion = await engine.chat.completions.create({
    messages: decisionPrompt.messages,
    temperature: 0.2,
    max_tokens: 256,
    stream: false,
    signal,
  });

  const raw = decisionCompletion.choices?.[0]?.message?.content ?? "";
  const normalized = normalizeDecision(raw);
  const normalizedQuery = normalized.query?.trim();
  const notes: string[] = [...normalized.warnings];

  const searchWasFlipped =
    normalized.diagnostics.actionFlip === "searchToRespond" && !normalizedQuery;

  let { action } = normalized;
  let query = normalized.action === "search" ? normalizedQuery || null : null;

  if ((normalized.action === "search" && !query) || searchWasFlipped) {
    const fallbackQuery = buildFallbackSearchQuery(planningQuestion);
    if (fallbackQuery) {
      query = fallbackQuery;
      action = "search";
      notes.push(
        "Requête absente dans la décision : utilisation du message utilisateur comme requête de recherche.",
      );
    } else {
      action = "respond";
      notes.push(
        "Recherche demandée sans requête exploitable : repli sur une réponse directe.",
      );
    }
  }

  return {
    action,
    query: action === "search" ? query : null,
    plan: normalized.plan,
    rationale: normalized.rationale,
    notes,
    diagnostics: normalized.diagnostics,
    trace: {
      decisionMessages: decisionPrompt.messages,
      modelRawDecision: raw,
      normalizedDecision: normalized,
      contextualHints: decisionPrompt.contextualHints,
      freshDataLine: decisionPrompt.freshDataLine,
    },
  };
}

export async function decideNextAction(
  engine: MLCEngine,
  userMessage: Message,
  history: Message[],
  config: Config,
  memory: SemanticMemoryClient | null,
  externalEvidence?: string | null,
): Promise<NextActionDecision> {
  const context = await buildContext(engine, {
    userMessage,
    history,
    config,
    memory,
    externalEvidence: externalEvidence ?? null,
  });

  const toolSpecPrompt = formatToolSpecPrompt(config);

  const freshDataHint =
    context.slices.debug.taskCategory === "needs_web"
      ? "La requête semble dépendre de données récentes (scores, actualités, mises à jour)."
      : null;

  const normalizedDecision = await decideNextActionFromMessages(
    engine,
    context.messagesForPlanning,
    toolSpecPrompt,
    freshDataHint,
  );

  const action: "respond" | "search" =
    normalizedDecision.action === "search" && config.toolSearchEnabled
      ? "search"
      : "respond";

  const query = action === "search" ? normalizedDecision.query : null;

  return {
    action,
    query,
    plan: normalizedDecision.plan,
    rationale: normalizedDecision.rationale,
    diagnostics: normalizedDecision.diagnostics,
    trace: normalizedDecision.trace,
    notes: normalizedDecision.notes,
    debugContext: context.slices.debug,
    context,
  } satisfies NextActionDecision;
}

export async function decideAction(
  engine: MLCEngine,
  inputText: string,
  history: Message[],
  toolSpecPrompt: string,
  signal?: AbortSignal,
  hints?: DecisionHints,
): Promise<DecisionResult> {
  const recentHistory = history.slice(-MAX_CONTEXT_MESSAGES);
  const decisionMessages = buildDecisionMessages(
    inputText,
    recentHistory,
    toolSpecPrompt,
    hints,
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
