import {
  callFacebookPagePostsTool,
  callOutlookEventsTool,
  callScrapeTool,
  callWeatherTool,
  type ToolResult,
  type ToolSource,
} from "./toolClients";

export type ExternalToolKind =
  | "web_search"
  | "weather"
  | "outlook_calendar"
  | "facebook_page"
  | "scrape";

const detectToolKind = (input: string): ExternalToolKind => {
  const lower = input.toLowerCase();
  const weatherKeywords = [
    "météo",
    "meteo",
    "weather",
    "température",
    "temperature",
    "degre",
    "degré",
    "°c",
    "°f",
  ];

  if (weatherKeywords.some((kw) => lower.includes(kw))) {
    return "weather";
  }

  if (
    lower.includes("outlook") ||
    lower.includes("office 365") ||
    lower.includes("calendar") ||
    lower.includes("calendrier") ||
    lower.includes("rdv") ||
    lower.includes("rendez-vous")
  ) {
    return "outlook_calendar";
  }

  if (lower.includes("facebook") || lower.includes("fb page")) {
    return "facebook_page";
  }

  if (
    lower.includes("scrape") ||
    lower.includes("analyse cette page") ||
    lower.includes("extraire le contenu") ||
    lower.match(/https?:\/\/\S+/)
  ) {
    return "scrape";
  }

  return "web_search";
};

const extractCityFromInput = (input: string, fallback: string): string => {
  const regexes = [
    /m[ée]t[ée]o\s+(?:de|du|pour|a|à)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)/i,
    /weather\s+(?:in|for)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)/i,
    /temp[ée]rature(?:\s+actuelle)?\s+(?:a|à|pour|en)\s+([A-Za-zÀ-ÖØ-öø-ÿ\s-]+)/i,
  ];

  for (const regex of regexes) {
    const match = input.match(regex);
    if (match?.[1]) return match[1].trim();
  }

  return fallback;
};

const extractFbPageId = (input: string, fallback: string): string => {
  const urlMatch = input.match(/facebook\.com\/([A-Za-z0-9_.-]+)/i);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  const nameMatch = input.match(/page\s+([A-Za-z0-9_.-]+)/i);
  if (nameMatch && nameMatch[1]) return nameMatch[1];
  return fallback.trim().slice(0, 64);
};

const extractUrlForScrape = (input: string, fallback: string): string => {
  const urlMatch = input.match(/https?:\/\/\S+/i);
  if (urlMatch && urlMatch[0]) return urlMatch[0];
  return fallback;
};

export type ExternalToolRequest = {
  decisionQuery: string;
  userInput: string;
};

export type ExternalToolResult = {
  content: string;
  sources: ToolSource[];
};

export const performExternalTool = async (
  { decisionQuery, userInput }: ExternalToolRequest,
  performWebSearch: (
    query: string,
    parentSignal?: AbortSignal | null,
  ) => Promise<ExternalToolResult>,
  parentSignal?: AbortSignal | null,
): Promise<ExternalToolResult> => {
  const trimmedQuery = decisionQuery.trim() || userInput.trim();
  const kind = detectToolKind(userInput || decisionQuery);

  switch (kind) {
    case "weather": {
      const city = extractCityFromInput(userInput, trimmedQuery);
      const result: ToolResult = await callWeatherTool({
        city,
        units: "metric",
      });
      return {
        content: result.content,
        sources: result.sources || [],
      };
    }

    case "outlook_calendar": {
      const result: ToolResult = await callOutlookEventsTool({
        days_ahead: 7,
      });
      return {
        content: result.content,
        sources: result.sources || [],
      };
    }

    case "facebook_page": {
      const pageId = extractFbPageId(userInput, trimmedQuery);
      const result: ToolResult = await callFacebookPagePostsTool({
        page_id: pageId,
        limit: 5,
      });
      return {
        content: result.content,
        sources: result.sources || [],
      };
    }

    case "scrape": {
      const url = extractUrlForScrape(userInput, trimmedQuery);
      const result: ToolResult = await callScrapeTool({
        url,
        max_chars: 4000,
      });
      return {
        content: result.content,
        sources: result.sources || [{ title: url, url }],
      };
    }

    case "web_search":
    default: {
      return performWebSearch(trimmedQuery, parentSignal);
    }
  }
};
