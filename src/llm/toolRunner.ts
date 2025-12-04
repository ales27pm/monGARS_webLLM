import type { OrchestratorTool } from "../prompts/orchestrator";

export interface ToolResult {
  tool: OrchestratorTool;
  query: string;
  rawResult: unknown;
  textSummary: string;
}

export async function runTool(
  tool: OrchestratorTool,
  query: string,
): Promise<ToolResult | null> {
  if (tool === "none") return null;

  switch (tool) {
    case "weather":
      return runWeatherTool(query);
    case "outlook":
      return runOutlookTool(query);
    case "facebook":
      return runFacebookTool(query);
    case "webpage":
      return runWebpageTool(query);
    case "websearch":
      return runWebSearchTool(query);
    case "auto":
      return runWebSearchTool(query);
    default:
      return null;
  }
}

async function runWeatherTool(query: string): Promise<ToolResult> {
  const city = query || "Montréal";

  const sample = {
    city,
    tempC: 2,
    condition: "ciel nuageux",
  };

  const textSummary = `Météo pour ${sample.city} : environ ${sample.tempC} °C, ${sample.condition}.`;

  return {
    tool: "weather",
    query,
    rawResult: sample,
    textSummary,
  };
}

async function runOutlookTool(query: string): Promise<ToolResult> {
  const events = [
    { title: "Réunion projet monGARS", when: "demain 10h", location: "Teams" },
  ];

  const textSummary =
    "Prochains événements Outlook :\n" +
    events.map((event) => `- ${event.title}, ${event.when}, ${event.location}`).join("\n");

  return {
    tool: "outlook",
    query,
    rawResult: events,
    textSummary,
  };
}

async function runFacebookTool(query: string): Promise<ToolResult> {
  const page = query || "Page Facebook";
  const posts = [
    { title: "Post épinglé", snippet: "Bienvenue sur notre page..." },
    { title: "Annonce", snippet: "Mise à jour des fonctionnalités." },
  ];

  const textSummary =
    `Derniers posts sur la page Facebook "${page}" :\n` +
    posts.map((post) => `- ${post.title} : ${post.snippet}`).join("\n");

  return {
    tool: "facebook",
    query,
    rawResult: posts,
    textSummary,
  };
}

async function runWebpageTool(query: string): Promise<ToolResult> {
  const url = query.trim();
  const extractedText = `Contenu analysé de la page ${url || "(URL inconnue)"} (extrait simulé).`;

  return {
    tool: "webpage",
    query,
    rawResult: { url, extractedText },
    textSummary: extractedText,
  };
}

async function runWebSearchTool(query: string): Promise<ToolResult> {
  const q = query || "requête générale";
  const results = [
    { title: "Résultat 1", snippet: "Aperçu du contenu 1..." },
    { title: "Résultat 2", snippet: "Aperçu du contenu 2..." },
  ];

  const textSummary =
    `Résultats de recherche pour "${q}" :\n` +
    results.map((result) => `- ${result.title} : ${result.snippet}`).join("\n");

  return {
    tool: "websearch",
    query,
    rawResult: results,
    textSummary,
  };
}
