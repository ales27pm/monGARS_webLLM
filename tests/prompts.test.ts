import { describe, expect, it } from "vitest";
import {
  ORCHESTRATOR_PROMPT,
  REASONING_GRAPH_PROMPT,
  SYSTEM_PROMPT_MON_GARS,
  TOOL_SELECTOR_PROMPT,
  UX_FORMATTER_PROMPT,
} from "../src/prompts";

describe("prompt library", () => {
  it("expose des blocs de prompts non vides", () => {
    const prompts = [
      SYSTEM_PROMPT_MON_GARS,
      ORCHESTRATOR_PROMPT,
      TOOL_SELECTOR_PROMPT,
      UX_FORMATTER_PROMPT,
      REASONING_GRAPH_PROMPT,
    ];

    for (const prompt of prompts) {
      expect(prompt.trim().length).toBeGreaterThan(120);
    }
  });

  it("couvre les règles clés de monGARS (langue, transparence, refus)", () => {
    expect(SYSTEM_PROMPT_MON_GARS).toContain("FRANÇAIS");
    expect(SYSTEM_PROMPT_MON_GARS).toContain("Réponse basée sur mes connaissances internes");
    expect(SYSTEM_PROMPT_MON_GARS).toContain("Cette réponse inclut des informations mises à jour");
  });

  it("balise l’orchestration en JSON strict", () => {
    expect(ORCHESTRATOR_PROMPT).toContain("STRICTEMENT un JSON valide");
    expect(ORCHESTRATOR_PROMPT).toContain("needs_fresh_data");
    expect(ORCHESTRATOR_PROMPT).toContain('"tool": "none"');
  });

  it("documente la sélection d’outils et la mise en forme UX", () => {
    expect(TOOL_SELECTOR_PROMPT).toContain("websearch");
    expect(TOOL_SELECTOR_PROMPT).toContain("explication courte en français");
    expect(UX_FORMATTER_PROMPT).toContain("Réponse générée à partir de mes connaissances internes");
    expect(UX_FORMATTER_PROMPT).toContain("informations mises à jour à partir de sources externes");
  });

  it("décrit un graphe de pensée structuré", () => {
    expect(REASONING_GRAPH_PROMPT).toContain("Comprendre l’intention");
    expect(REASONING_GRAPH_PROMPT).toContain("Décider outil ou réponse directe");
    expect(REASONING_GRAPH_PROMPT).toContain("Formuler la réponse");
  });
});
