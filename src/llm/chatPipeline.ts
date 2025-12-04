import type { MLCEngine } from "@mlc-ai/web-llm";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";

import { SYSTEM_PROMPT_MON_GARS } from "../prompts/system";
import { runOrchestrator } from "./orchestratorRunner";
import type { OrchestratorOutput } from "../prompts/orchestrator";
import { runTool, type ToolResult } from "./toolRunner";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatPipelineResult {
  assistantMessage: ChatTurn;
  orchestrator: OrchestratorOutput;
  toolResult: ToolResult | null;
  mode: "offline" | "online" | "mixed";
}

export async function runChatPipeline(opts: {
  engine: MLCEngine;
  history: ChatTurn[];
  userText: string;
}): Promise<ChatPipelineResult> {
  const { engine, history, userText } = opts;

  const orch = await runOrchestrator(engine, userText);

  let toolResult: ToolResult | null = null;
  let mode: "offline" | "online" | "mixed" = "offline";

  if (orch.action === "search" && orch.tool !== "none") {
    toolResult = await runTool(orch.tool, orch.query || userText);
    if (toolResult) {
      mode = "online";
    }
  }

  const baseMode = mode === "online" && history.length > 0 ? "mixed" : mode;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT_MON_GARS,
    },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    {
      role: "user",
      content: userText,
    },
  ];

  if (toolResult) {
    messages.push({
      role: "system",
      content: `[Contexte issu d’un outil externe]\n${toolResult.textSummary}`,
    });
  }

  const completion = await engine.chat.completions.create({
    messages,
    stream: false,
  } as any);

  const assistantText =
    completion.choices?.[0]?.message?.content ??
    "Désolé, je n’ai pas pu générer de réponse.";

  const assistantMessage: ChatTurn = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: decorateWithMode(assistantText, baseMode),
  };

  return {
    assistantMessage,
    orchestrator: orch,
    toolResult,
    mode: baseMode,
  };
}

function decorateWithMode(
  answer: string,
  mode: "offline" | "online" | "mixed",
): string {
  const trimmed = answer.trim();
  let suffix = "";

  if (mode === "offline") {
    suffix =
      "\n\n_(Réponse générée à partir de mes connaissances internes, sans accès à Internet.)_";
  } else if (mode === "online") {
    suffix =
      "\n\n_(Cette réponse inclut des informations mises à jour à partir de sources externes.)_";
  } else if (mode === "mixed") {
    suffix =
      "\n\n_(Cette réponse combine ton contexte de conversation et des informations mises à jour à partir de sources externes.)_";
  }

  return trimmed + suffix;
}
