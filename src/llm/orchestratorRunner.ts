import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import type { MLCEngine } from "@mlc-ai/web-llm";
import { ORCHESTRATOR_PROMPT, type OrchestratorOutput } from "../prompts/orchestrator";

export class OrchestratorError extends Error {
  constructor(message: string, public raw?: unknown) {
    super(message);
    this.name = "OrchestratorError";
  }
}

/**
 * Call the LLM as an orchestrator in JSON mode.
 * It:
 *  - sends the ORCHESTRATOR_PROMPT as system
 *  - sends the user message
 *  - expects a strict JSON object as output
 */
export async function runOrchestrator(
  engine: MLCEngine,
  userMessage: string,
): Promise<OrchestratorOutput> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: ORCHESTRATOR_PROMPT,
    },
    {
      role: "user",
      content: userMessage,
    },
  ];

  const completion = await engine.chat.completions.create({
    messages,
    stream: false,
    response_format: { type: "json_object" },
  } as any);

  const content = completion.choices?.[0]?.message?.content ?? "";

  if (!content || typeof content !== "string") {
    throw new OrchestratorError("Orchestrator returned empty content", completion);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new OrchestratorError("Failed to parse orchestrator JSON output", {
      content,
      error,
    });
  }

  const out = parsed as OrchestratorOutput;
  if (!out.action || !out.intent || !Array.isArray(out.plan)) {
    throw new OrchestratorError("Orchestrator JSON missing required fields", parsed);
  }

  const normalizedGraph = out.graph ?? { nodes: [], edges: [] };

  return {
    ...out,
    query: out.query ?? "",
    graph: normalizedGraph,
    needs_fresh_data: Boolean(out.needs_fresh_data),
    confidence: typeof out.confidence === "number" ? out.confidence : 0.5,
  };
}
