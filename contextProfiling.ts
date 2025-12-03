import type { Message } from "./types";

export type RequestProfile = {
  intent: "information" | "code" | "analysis";
  requiresFreshData: boolean;
  ambiguitySignals: string[];
  contextualAnchors: string[];
  followUpDetected: boolean;
};

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
    regex: /(analys[ei]s?e?|comparaison|diagnostic|synth[eè]se)/i,
  },
];

const FRESHNESS_PATTERNS = [
  /\baujourd'hui|today|maintenant|actuel(le)?|en\s+direct/i,
  /\bdernier(e)?s?\s+(chiffres|statistiques|mises?\s+à\s+jour)/i,
  /\b(202[3-9]|202\d)\b/, // explicit recent year hints
];

const FOLLOW_UP_PATTERNS = [
  /comme (pr[eé]c[eé]dent|avant)/i,
  /\b(encore|suite)\b/i,
];

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

export const buildRequestProfile = (
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

export const formatContextualHints = (profile: RequestProfile) => {
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

export const buildContextualHints = (
  inputText: string,
  recentHistory: Message[],
): string => {
  const profile = buildRequestProfile(inputText, recentHistory);
  return formatContextualHints(profile);
};
