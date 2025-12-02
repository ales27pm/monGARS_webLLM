# Conversation Analysis

## Overview

This document reviews the French conversation between a user ("Moi") and the assistant ("MG") about sled dogs in the Far North. The assistant repeatedly declined to answer by labeling the topic as "non pertinent," which is inaccurate and unhelpful.

## Issues Identified

1. **Incorrect refusal despite safe, relevant topic**
   - The user asked for information about sled dogs, a common and non-sensitive subject. The assistant twice claimed it could not respond because the topic was "non pertinent," offering no guidance or information.
   - **Better response:** Acknowledge the request as valid and provide factual information on sled dogs (breeds such as Husky de Sibérie, Malamute d'Alaska, Groenlandais; history; roles in transport and search-and-rescue; welfare and training considerations). Offer to fetch additional details if internet access is available.

2. **Missed clarification opportunity**
   - When the assistant was unsure what specific details were wanted, it did not ask clarifying questions. Instead, it repeated the refusal, preventing progress.
   - **Better response:** Ask what aspects the user wants (history, breeds, training, welfare, equipment, Arctic vs. Antarctic use) while still sharing baseline facts.

3. **Failure to leverage environment capabilities**
   - The assistant did not mention whether it could search the internet or use built-in knowledge, leaving the user uncertain about available support.
   - **Better response:** State capability (e.g., "I can provide general knowledge and, if needed, search for recent data") and proceed with a helpful answer.

4. **Shallow reasoning and decision trace**
   - The assistant did not articulate why it declined or how it interpreted safety/policy constraints, so the user could not understand or correct the misunderstanding.
   - **Better response:** Briefly state the reasoning chain: (a) classify topic safety, (b) confirm request intent, (c) decide to answer with known data or offer a search, (d) ask a clarifying follow-up only if needed. Sharing this trace keeps the interaction transparent and correctable.

## Root cause and fix in one glance

- **Root cause:** The assistant prematurely refused because it treated a benign topic as "non pertinent" and never ran a visible safety/intent/capability check.
- **Fix:** Always run a compact decision trace (safety → intent → capability → answer) and share the outcome with the user before deciding to refuse.

## Recommended Improved Flow

1. **Acknowledge and affirm relevance:** Confirm the topic is valid and safe to discuss.
2. **Provide concise, factual information immediately:** Offer a short overview (breeds, uses, climate adaptations, welfare).
3. **Expose reasoning briefly:** State that the topic is safe and why you can answer now ("Sujet grand public, aucune contrainte de sécurité").
4. **Offer deeper details or sources:** Suggest additional angles (training routines, nutrition in sub-zero climates, historical expeditions).
5. **Invite clarification while staying helpful:** Ask what the user wants next without deflecting.
6. **Handle capability context explicitly:** Note whether internet search is possible; if not, share offline knowledge and suggest further research paths.
7. **Log the decision path mentally:** Keep an internal checklist—safety → intent → capability → answer → offer more—so refusals only happen when justified.

## Reasoning pipeline location and flow (code-aware)

This section maps each reasoning stage to the exact functions that run it so engineers can trace the control flow without hunting through the file.

1. **System prompt & guardrails (what the model must do)**
   - `DECISION_SYSTEM_PROMPT` and `ANSWER_GUARDRAILS` in `decisionEngine.ts` require a Tree-of-Thought plan (≥3 steps), a binary action (`search` or `respond`), and JSON-only output (`action`, `query`, `plan`, `rationale`, `response`).

2. **Decision prompt assembly (what context we send)**
   - `buildDecisionMessages` stitches together the user request, a trimmed history (`MAX_CONTEXT_MESSAGES`), and the available tool spec before the decision call.

3. **Model invocation & runtime entrypoint (who triggers the model)**
   - `decideAction` is the entrypoint invoked by the app. It calls `engine.chat.completions.create` with the decision prompt and returns the normalized decision that tells the UI to search or answer immediately.

4. **Contextual profiling (how we align with intent & recency)**
   - `buildDecisionMessages` now builds a `RequestProfile` from the latest user request and trimmed history: intent classification (information/code/analysis), freshness signals, follow-up detection, ambiguity markers (e.g., pronouns), and keyword anchors. These hints are injected into the decision prompt to reduce off-topic refusals and steer the plan toward the right action.

5. **Parsing & normalization (how we make outputs safe to use)**
   - `stripJson` extracts fenced JSON. `normalizePlan` enforces a multi-step plan structure. `normalizeDecision` validates with `zod`, auto-switches between `search`/`respond` when query or response fields are missing, injects fallback rationale/plan so downstream flows never break, and emits warnings when plans/rationales are defaulted or inverted.

6. **Answer construction (how we build the final reply)**
   - When the action is `respond`, `buildAnswerHistory` assembles the answering prompt using the chosen plan, guardrails, conversation history, and the user message before calling the answering model.

### Operational decision trace (ready to copy)

- **Safety:** "Topic = chiens de traîneau → grand public → sûr."
- **Intent:** "User seeks information; no disallowed intent detected."
- **Capability:** "Offline knowledge available; online search optional—state which applies."
- **Answer:** Provide a concise, factual summary first, then offer depth.
- **Follow-up:** Ask one clarifying question only if it unblocks additional value.

## Example Improved Response (French)

« Bien sûr ! Les chiens de traîneau comme le Husky de Sibérie, le Malamute d'Alaska ou le chien du Groenland sont utilisés dans le Grand Nord pour le transport, la logistique et parfois les missions de secours. Ils sont sélectionnés pour leur endurance, leur pelage double qui les protège du froid et leur aptitude au travail en équipe. L’entraînement inclut socialisation, commandes vocales ("hike", "gee", "haw"), alimentation riche en calories et contrôle vétérinaire régulier pour éviter les blessures liées au froid. Je peux partager davantage de détails hors ligne dès maintenant et, si besoin, rechercher des sources récentes. Souhaitez-vous des précisions sur les races, l’équipement du traîneau ou l’histoire des expéditions ? »
