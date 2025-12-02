import fs from "node:fs/promises";
import path from "node:path";

import {
  buildAnswerHistory,
  buildDecisionMessages,
  normalizeDecision,
} from "../decisionEngine";
import type { Config, Message } from "../types";

interface PromptCaseExpectation {
  expectedAction: "respond" | "search";
  expectResponseMissing?: boolean;
  expectResponseRecovered?: boolean;
  expectActionFlip?: "searchToRespond" | "respondToSearch";
  warningSubstrings?: string[];
}

interface PromptCase {
  id: string;
  description: string;
  userInput: string;
  history: Message[];
  toolSpecPrompt: string;
  modelDecision: string;
  expectations: PromptCaseExpectation;
}

const defaultConfig: Config = {
  modelId: "diagnostic-mock",
  systemPrompt:
    "Assistant de raisonnement. Suis les garde-fous et fournis des réponses structurées.",
  temperature: 0.2,
  maxTokens: 256,
  theme: "light",
};

const buildMessage = (
  id: string,
  role: Message["role"],
  content: string,
): Message => ({
  id,
  role,
  content,
  timestamp: Date.now(),
});

const promptCases: PromptCase[] = [
  {
    id: "respond-missing-response",
    description:
      "Model chooses respond but omits the response field; pipeline should flag missing response and keep respond action.",
    userInput:
      "Explique comment calibrer un microphone USB pour le podcasting.",
    history: [
      buildMessage(
        "h1",
        "user",
        "Je veux améliorer la qualité audio de mes enregistrements maison.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"respond","plan":"Analyser la demande;Lister le matériel;Décrire la procédure","rationale":"Pas besoin de recherche.","response":"   "}',
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: true,
      warningSubstrings: ["Réponse finale absente", "Plan Tree-of-Thought"],
    },
  },
  {
    id: "search-missing-query",
    description:
      "Model selects search without a query; normalization should flip to respond and warn about the missing query.",
    userInput: "Quelles sont les dernières mises à jour de sécurité Linux?",
    history: [
      buildMessage(
        "h2",
        "assistant",
        "Les mises à jour changent régulièrement.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"search","plan":"Analyser;Vérifier la fraîcheur;Rédiger","rationale":"Actualités récentes."}',
    expectations: {
      expectedAction: "respond",
      expectActionFlip: "searchToRespond",
      warningSubstrings: [
        "Action inversée en respond",
        "Plan reformatté",
        "Réponse finale absente",
      ],
    },
  },
  {
    id: "respond-recovered",
    description:
      "Model omits response in JSON but provides it unstructured; pipeline should recover the loose response.",
    userInput:
      "Donne trois idées d'atelier sur la cybersécurité pour des étudiants.",
    history: [
      buildMessage(
        "h3",
        "user",
        "Sujet précédent: bonnes pratiques de mots de passe.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision: `{"action":"respond","plan":"Brainstorm;Prioriser;Structurer","rationale":"Pas de recherche nécessaire."}\nresponse: 1) Simuler un phishing...`,
    expectations: {
      expectedAction: "respond",
      expectResponseRecovered: true,
      warningSubstrings: ["Réponse récupérée", "Plan reformatté"],
    },
  },
  {
    id: "fallback-unstructured",
    description:
      "Model returns unstructured text; fallback should parse best-effort search intent and surface parsing issues.",
    userInput: "Fournis un comparatif des licences open source permissives.",
    history: [
      buildMessage(
        "h4",
        "assistant",
        "Dernière fois nous avons parlé des licences copyleft.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision: '{"action":"search","query":"ok","plan":"Résumé"}',
    expectations: {
      expectedAction: "search",
      warningSubstrings: ["Échec de parsing JSON"],
    },
  },
  {
    id: "respond-with-query",
    description:
      "Model répond directement mais fournit une requête de recherche : le pipeline doit rester en respond et signaler la requête superflue.",
    userInput: "Peux-tu résumer l'évolution du marché des GPU depuis 2022?",
    history: [
      buildMessage(
        "h5",
        "assistant",
        "Je peux t'aider sans rechercher si tu veux un résumé.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"respond","query":"prix gpu 2025","plan":"Répondre rapidement","rationale":"Résumé connu","response":"Résumé synthétique..."}',
    expectations: {
      expectedAction: "respond",
      warningSubstrings: [
        "Plan Tree-of-Thought insuffisant",
        "Requête de recherche fournie mais action respond retenue",
      ],
    },
  },
  {
    id: "search-with-response",
    description:
      "Model déclenche une recherche avec une réponse déjà fournie : le pipeline doit conserver search et avertir que la réponse est ignorée.",
    userInput:
      "Quels sont les derniers tarifs d'électricité résidentielle en France?",
    history: [
      buildMessage("h6", "user", "Je dois mettre à jour mon budget énergie."),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"search","query":"tarifs electricite France 2025","plan":"Analyser;Comparer;Mettre à jour","rationale":"Données volatiles","response":"Voici une estimation..."}',
    expectations: {
      expectedAction: "search",
      warningSubstrings: [
        "Plan reformatté",
        "Réponse finale fournie mais ignorée car l'action est search",
      ],
    },
  },
  {
    id: "fallback-respond-missing",
    description:
      "Sortie non structurée qui mentionne respond sans réponse : le fallback doit garder respond et signaler l'absence de réponse.",
    userInput:
      "Donne-moi un plan rapide pour organiser une conférence étudiante.",
    history: [
      buildMessage(
        "h7",
        "assistant",
        "Précise si tu veux un plan détaillé ou une simple checklist.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision: "action: respond; plan: plan court",
    expectations: {
      expectedAction: "respond",
      warningSubstrings: [
        "Échec de parsing JSON",
        "Aucune réponse trouvée dans le fallback",
      ],
      expectResponseMissing: true,
    },
  },
  {
    id: "future-carbon-search-hint",
    description:
      "Demande future avec sources récentes où le modèle répond sans recherche : la normalisation doit signaler l'absence de réponse et l'indication de recherche.",
    userInput:
      "L'impact économique du nouveau tarif carbone européen en 2026, avec sources récentes.",
    history: [],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"respond","plan":"Répondre rapidement","rationale":"Sources récentes 2026 requises","response":""}',
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: true,
      warningSubstrings: [
        "Justification suggère search",
        "Réponse finale absente",
      ],
    },
  },
  {
    id: "router-plan-rationale-contradiction",
    description:
      "Plan privilégie une réponse directe mais l'action est search : vérifier l'alerte de contradiction et l'ignorance de la réponse.",
    userInput:
      "Explique rapidement comment réinitialiser un routeur domestique et quand appeler le support.",
    history: [
      buildMessage(
        "h8",
        "assistant",
        "Je peux te guider directement sans support si besoin.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"search","query":"reset routeur domicile support","plan":"Répondre en synthèse courte","rationale":"Rechercher les étapes précises","response":"Appuie 10 secondes sur Reset."}',
    expectations: {
      expectedAction: "search",
      warningSubstrings: [
        "Plan suggère respond mais action search retenue.",
        "Réponse finale fournie mais ignorée",
      ],
    },
  },
  {
    id: "club-cyber-loose-plan",
    description:
      "Réponse libre hors JSON avec plan minimal : le fallback doit conserver respond et ne pas marquer la réponse comme manquante.",
    userInput:
      "Liste trois étapes pour créer un club cybersécurité universitaire.",
    history: [
      buildMessage("h9", "user", "Contexte: association étudiante débutante."),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      "action: respond\nplan: étapes courtes\nresponse: 1) Trouver un sponsor 2) Définir un programme 3) Organiser la première réunion",
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: false,
      warningSubstrings: ["Échec de parsing JSON"],
    },
  },
  {
    id: "climate-2027-search-hint",
    description:
      "Réponse directe sur un sujet futuriste : le pipeline doit conserver respond mais signaler le besoin de recherche implicite.",
    userInput:
      "Que disent les dernières projections climatiques 2027 du GIEC? Inclure les mises à jour récentes.",
    history: [
      buildMessage(
        "h10",
        "assistant",
        "Je peux résumer ce que je connais si tu veux.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"respond","plan":"Répondre rapidement;Synthèse courte","rationale":"Mises à jour récentes nécessaires","response":"Synthèse basée sur les données 2024."}',
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: false,
      warningSubstrings: [
        "Plan Tree-of-Thought insuffisant",
        "Justification suggère search",
      ],
    },
  },
  {
    id: "ctf-offline-loose-plan",
    description:
      "Plan succinct hors JSON pour un challenge CTF sans Internet : la récupération doit préserver la réponse tout en signalant le fallback.",
    userInput:
      "Donne un plan succinct pour lancer un challenge capture-the-flag étudiant sans accès internet.",
    history: [
      buildMessage("h11", "user", "Contrainte : l'événement est hors ligne."),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      "action: respond\nplan: plan rapide\nresponse: 1) Préparer des VM locales 2) Définir des défis 3) Tester et lancer",
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: false,
      warningSubstrings: ["Échec de parsing JSON"],
    },
  },
  {
    id: "tls-quic-contradiction",
    description:
      "Justification oriente vers une recherche mais l'action est respond : le pipeline doit avertir de la contradiction.",
    userInput:
      "Dois-je chercher des sources externes pour comparer TLS 1.3 et QUIC ou puis-je répondre directement?",
    history: [
      buildMessage(
        "h12",
        "assistant",
        "Je peux comparer rapidement si besoin.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"respond","plan":"Comparer rapidement","rationale":"Chercher des sources externes pour être sûr","response":"Résumé court sans sources."}',
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: false,
      warningSubstrings: [
        "Plan Tree-of-Thought insuffisant",
        "Justification suggère search",
      ],
    },
  },
  {
    id: "inflation-search-required",
    description:
      "Demande de données très fraîches sans requête fournie : le pipeline doit signaler le besoin de recherche et l'absence de requête.",
    userInput:
      "Donne-moi les derniers chiffres d'inflation publiés ce mois-ci pour la zone euro avec une source.",
    history: [
      buildMessage(
        "h13",
        "assistant",
        "Je peux vérifier les chiffres récents si nécessaire.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"respond","plan":"Répondre vite","rationale":"Données récentes à confirmer","response":""}',
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: true,
      warningSubstrings: [
        "Justification suggère search",
        "Recherche requise mais requête de recherche absente",
      ],
    },
  },
  {
    id: "python-313-ambiguous",
    description:
      "Réponse libre avec justification ambiguë : détecter les indices contradictoires entre l'absence de recherche et des nouveautés récentes.",
    userInput:
      "Je pense avoir déjà les infos, mais résume en deux phrases les nouveautés de Python 3.13 sans chercher.",
    history: [
      buildMessage(
        "h14",
        "assistant",
        "Pas de recherche souhaitée si tu sais déjà.",
      ),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      "action: respond\nplan: plan succinct\nrationale: sans chercher mais nouveautés Python 3.13 récentes\nresponse: Améliorations de performance et nouvelles APIs.",
    expectations: {
      expectedAction: "respond",
      expectResponseMissing: false,
      warningSubstrings: [
        "Échec de parsing JSON",
        "Justification suggère search",
      ],
    },
  },
  {
    id: "openssl-search-plan",
    description:
      "Plan détaillé pour une action search : le pipeline doit garder search et ignorer la réponse fournie.",
    userInput:
      "Liste un plan d'investigation en 4 étapes avant de rechercher des correctifs récents pour OpenSSL.",
    history: [
      buildMessage("h15", "user", "Objectif: vérifier les patchs critiques."),
    ],
    toolSpecPrompt:
      "Outil search: GET /search?q=... (retourne les premiers liens).",
    modelDecision:
      '{"action":"search","query":"patch OpenSSL récents","plan":"Identifier la version;Lister les CVE;Prioriser les risques;Préparer le déploiement","rationale":"Vérifier les correctifs", "response":"Réponse accidentelle"}',
    expectations: {
      expectedAction: "search",
      warningSubstrings: [
        "Plan reformatté",
        "Réponse finale fournie mais ignorée car l'action est search",
      ],
    },
  },
];

type NextPrompt = { title: string; prompt: string; objective: string };

const nextRoundPrompts: NextPrompt[] = [
  {
    title: "Actualités critiques avec recherche obligatoire",
    prompt:
      "Résume les vulnérabilités zero-day Windows découvertes cette semaine avec une requête de recherche précise.",
    objective:
      "Forcer la recherche pour des données critiques et fraîchement publiées et vérifier l'avertissement si la requête manque.",
  },
  {
    title: "Checklist détaillée sans internet",
    prompt:
      "Donne une checklist en 5 points pour préparer une présentation technique sans utiliser Internet ni outils de recherche.",
    objective:
      "Valider le maintien d'un plan complet en mode respond même si une requête de recherche superflue apparaît.",
  },
  {
    title: "Récupération de réponse hors JSON",
    prompt:
      "Fournis deux idées d'ateliers IA pour étudiants; si tu ne peux pas formatter en JSON, écris quand même la réponse complète.",
    objective:
      "Tester la robustesse de récupération de réponse libre et la signalisation des avertissements de fallback.",
  },
];

const evaluateExpectations = (
  expectations: PromptCaseExpectation,
  decision = normalizeDecision(""),
): string[] => {
  const mismatches: string[] = [];

  if (decision.action !== expectations.expectedAction) {
    mismatches.push(
      `Action attendue ${expectations.expectedAction}, obtenue ${decision.action}.`,
    );
  }

  if (
    expectations.expectResponseMissing !== undefined &&
    decision.diagnostics.responseMissing !== expectations.expectResponseMissing
  ) {
    mismatches.push(
      `Etat responseMissing attendu ${expectations.expectResponseMissing}, obtenu ${decision.diagnostics.responseMissing}.`,
    );
  }

  if (
    expectations.expectResponseRecovered !== undefined &&
    decision.diagnostics.responseRecovered !==
      expectations.expectResponseRecovered
  ) {
    mismatches.push(
      `Récupération de réponse attendue ${expectations.expectResponseRecovered}, obtenue ${decision.diagnostics.responseRecovered}.`,
    );
  }

  if (
    expectations.expectActionFlip !== undefined &&
    decision.diagnostics.actionFlip !== expectations.expectActionFlip
  ) {
    mismatches.push(
      `Basculage d'action attendu ${expectations.expectActionFlip}, obtenu ${decision.diagnostics.actionFlip}.`,
    );
  }

  if (expectations.warningSubstrings?.length) {
    for (const expected of expectations.warningSubstrings) {
      const found = decision.warnings.some((warning) =>
        warning.toLowerCase().includes(expected.toLowerCase()),
      );
      if (!found) {
        mismatches.push(`Alerte attendue absente: ${expected}`);
      }
    }
  }

  return mismatches;
};

const buildCaseReport = (testCase: PromptCase) => {
  const decisionMessages = buildDecisionMessages(
    testCase.userInput,
    testCase.history,
    testCase.toolSpecPrompt,
  );
  const decision = normalizeDecision(testCase.modelDecision);
  const answerHistory = buildAnswerHistory(
    decision.plan,
    defaultConfig,
    testCase.history,
    testCase.userInput,
  );

  const mismatches = evaluateExpectations(testCase.expectations, decision);

  return {
    id: testCase.id,
    description: testCase.description,
    userInput: testCase.userInput,
    decisionMessages,
    normalizedDecision: decision,
    answerHistory,
    expectations: testCase.expectations,
    mismatches,
    passed: mismatches.length === 0,
  };
};

const toMarkdown = (reports: ReturnType<typeof buildCaseReport>[]) => {
  const lines: string[] = [
    "# Rapport de tests pipeline",
    `Exécution: ${new Date().toISOString()}`,
    "",
  ];

  for (const report of reports) {
    lines.push(`## ${report.id} — ${report.passed ? "✅" : "❌"}`);
    lines.push(report.description);
    lines.push("");
    lines.push("**Entrée utilisateur**");
    lines.push(report.userInput);
    lines.push("");
    lines.push("**Messages de décision (ordre d'envoi)**");
    lines.push("```json");
    lines.push(JSON.stringify(report.decisionMessages, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("**Décision normalisée et diagnostics**");
    lines.push("```json");
    lines.push(JSON.stringify(report.normalizedDecision, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("**Contexte de génération de réponse**");
    lines.push("```json");
    lines.push(JSON.stringify(report.answerHistory, null, 2));
    lines.push("```");
    if (report.mismatches.length > 0) {
      lines.push("");
      lines.push("**Écarts détectés**");
      for (const mismatch of report.mismatches) {
        lines.push(`- ${mismatch}`);
      }
    }
    lines.push("");
  }

  const passedCount = reports.filter((r) => r.passed).length;
  lines.push(
    `Résumé: ${passedCount}/${reports.length} cas valides. ` +
      `${passedCount === reports.length ? "Aucun écart." : "Des écarts doivent être investigués."}`,
  );

  return lines.join("\n");
};

const nextPromptsToMarkdown = (prompts: NextPrompt[]) => {
  const lines: string[] = [
    "# Prompts pour le prochain cycle",
    "Ces invites servent à élargir la couverture lors du prochain tour de tests.",
    "",
  ];

  for (const prompt of prompts) {
    lines.push(`## ${prompt.title}`);
    lines.push(`Prompt: ${prompt.prompt}`);
    lines.push(`Objectif: ${prompt.objective}`);
    lines.push("");
  }

  return lines.join("\n");
};

async function main() {
  const reports = promptCases.map(buildCaseReport);
  const overallPass = reports.every((report) => report.passed);

  const artifactsDir = path.join(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  await fs.writeFile(
    path.join(artifactsDir, "pipeline-report.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      cases: reports,
      summary: {
        total: reports.length,
        passed: reports.filter((report) => report.passed).length,
      },
    }),
    "utf8",
  );

  await fs.writeFile(
    path.join(artifactsDir, "pipeline-report.md"),
    toMarkdown(reports),
    "utf8",
  );

  await fs.writeFile(
    path.join(artifactsDir, "pipeline-next-prompts.md"),
    nextPromptsToMarkdown(nextRoundPrompts),
    "utf8",
  );

  console.log("Pipeline prompt coverage:");
  for (const report of reports) {
    console.log(
      `- ${report.id}: ${report.passed ? "PASS" : "FAIL"} (${report.mismatches.join(", ") || "aucun écart"})`,
    );
  }

  if (!overallPass) {
    console.error(
      "Au moins un scénario échoue, voir artifacts/pipeline-report.md",
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Erreur lors des tests du pipeline:", error);
  process.exit(1);
});
