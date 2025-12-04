// src/prompts/reasoning_graph.ts

/**
 * Prompt pour générer un graphe de pensée exploitable par l’UI :
 * nodes + edges, en lien avec l’intention, la décision d’outil,
 * et la structuration de la réponse.
 */

export const REASONING_GRAPH_PROMPT = `
Tu génères un graphe de pensée haut niveau pour représenter le raisonnement de monGARS.

Contexte :
- L’utilisateur a posé une question.
- L’orchestrateur a déjà décidé s’il faut "respond" ou "search".
- Nous voulons visualiser le chemin de pensée : compréhension → décision → plan → réponse.

Tu dois produire STRICTEMENT un JSON de la forme :

{
  "nodes": [
    { "id": "n1", "label": "Comprendre l’intention", "type": "intent" },
    { "id": "n2", "label": "Décider outil ou réponse directe", "type": "decision" },
    { "id": "n3", "label": "Élaborer un plan", "type": "plan" },
    { "id": "n4", "label": "Formuler la réponse", "type": "answer" }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "label": "analyse" },
    { "from": "n2", "to": "n3", "label": "choix" },
    { "from": "n3", "to": "n4", "label": "synthèse" }
  ]
}

Règles :

- Les "nodes" doivent couvrir au minimum :
  - l’intention (comprendre ce que veut l’utilisateur),
  - la décision outil vs réponse directe,
  - la planification de la réponse,
  - la formulation de la réponse.
- Tu peux ajouter d’autres nœuds (par ex. "Collecte via outil", "Fusion des informations") si pertinent.
- Les "edges" représentent les liens causaux / logiques entre étapes.
- "label" dans les nœuds et les arêtes est en français.
- Le JSON doit être valide, sans texte autour.

But :

- Ce graphe est utilisé uniquement pour visualisation interne dans l’UI de monGARS_webLLM.
- L’utilisateur final ne voit JAMAIS le JSON brut, seulement une représentation graphique.
`;

export interface ReasoningGraphNode {
  id: string;
  label: string;
  type?: string;
}

export interface ReasoningGraphEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ReasoningGraph {
  nodes: ReasoningGraphNode[];
  edges: ReasoningGraphEdge[];
}
