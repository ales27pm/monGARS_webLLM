import { z } from "zod";
import type { Config, Message, MLCEngine } from "./types";

export const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
export const MAX_CONTEXT_MESSAGES = 12;

export const ANSWER_GUARDRAILS = `Suis le plan, reste fidèle aux faits, aucune source inventée.
1) Résume ta stratégie en une phrase (obligatoire).
2) Donne la réponse finale en français clair et structurée.
3) Si tu utilises des sources, liste-les en fin de réponse (titre + URL).`;

export const DECISION_SYSTEM_PROMPT = `Tu es un orchestrateur de raisonnement qui choisit entre répondre directement ou appeler l'outil de recherche.

Contraintes incontournables :
- Inspecte minutieusement la requête et le contexte (messages récents uniquement).
- Construis un plan Tree-of-Thought en au moins 3 étapes numérotées (diagnostic, pistes, validation).
- Choisis strictement entre "search" (si une actualité, une donnée récente ou un doute factuel existe) ou "respond".
- Si tu choisis "search", propose un "query" optimisé (5-12 mots, factuel, sans ponctuation superflue, pas d'anaphores).
- Si tu choisis "respond", produis immédiatement le champ "response" avec la réponse finale en français qui suit STRICTEMENT les garde-fous :
  ${ANSWER_GUARDRAILS}
- Réponds UNIQUEMENT en JSON compact : {"action":"search|respond","query":"...","plan":"...","rationale":"...","response":"..."}.
- Ne mets jamais de Markdown ni de texte hors JSON dans les valeurs.`;

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

export const normalizeDecision = (raw: string) => {
  const parsed = stripJson(raw) || {};
  const decision = decisionSchema.safeParse(parsed);

  if (decision.success) {
    return decision.data;
  }

  const fallbackAction = /search/i.test(raw) ? "search" : "respond";
  const fallbackQueryMatch = raw.match(/query\s*[:=]\s*"?([^"}]+)"?/i);
  const fallbackResponseMatch = raw.match(
    /response\s*[:=]\s*"?([^}]+?)"?\s*(?:,|$)/i,
  );

  return {
    action: fallbackAction as "search" | "respond",
    query: fallbackQueryMatch?.[1]?.trim() || undefined,
    plan: "Analyser, traiter, valider.",
    rationale: "Fallback décision non structurée.",
    response: fallbackResponseMatch?.[1]?.trim(),
  } satisfies z.infer<typeof decisionSchema>;
};

export type DecisionResult = z.infer<typeof decisionSchema>;

export const buildDecisionMessages = (
  inputText: string,
  recentHistory: Message[],
  toolSpecPrompt: string,
) => [
  { role: "system", content: DECISION_SYSTEM_PROMPT },
  {
    role: "user",
    content:
      `Requête utilisateur:\n${inputText}\n\n` +
      `Historique récent (du plus ancien au plus récent):\n${formatConversationContext(recentHistory)}\n\n` +
      `Outil disponible: ${toolSpecPrompt}\n` +
      `Choisis entre search ou respond, fournis un plan ToT avec au moins 3 puces. Si tu réponds directement, mets la réponse finale dans "response" et respecte les garde-fous.`,
  },
];

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

  const rawDecision = decisionCompletion.choices[0]?.message?.content?.trim() ?? "";
  return normalizeDecision(rawDecision);
}
