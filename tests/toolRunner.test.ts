import { describe, expect, it } from "vitest";
import { runTool } from "../src/llm/toolRunner";

describe("runTool", () => {
  it("returns null when tool is none", async () => {
    const result = await runTool("none", "");
    expect(result).toBeNull();
  });

  it("returns a weather summary", async () => {
    const result = await runTool("weather", "Paris");
    expect(result?.tool).toBe("weather");
    expect(result?.textSummary).toContain("Paris");
  });

  it("falls back to search results for auto", async () => {
    const result = await runTool("auto", "actualité AI");
    expect(result?.tool).toBe("websearch");
    expect(result?.textSummary).toContain("Résultats de recherche");
  });
});
