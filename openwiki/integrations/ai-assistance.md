---
type: integration
title: AI assistance
description: How Examinus uses OpenAI, Claude and Gemini — per-organization keys stored encrypted, question drafting into a quiz part or the question bank through the kinds' draft shapes, score and feedback suggestions for essays, the student coach report with its rule-based fallback — and the permissions, rate limits and visibility rules around it.
tags: [ai, openai, anthropic, gemini, drafts, grading, coach, encryption]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-6eee860fd504f2e3cebcb5f9
    resource: repo://apps/rpc/src/database/schemas/quiz.ts
  - id: openwiki-source-cb53999e3c24ffa8186da71c
    resource: repo://apps/rpc/src/features/ai/Handlers.ts
  - id: openwiki-source-98be1a2bdf17f23d9e9a9264
    resource: repo://apps/rpc/src/features/ai/helpers.ts
  - id: openwiki-source-6f4959bb1b0817e3af76fba4
    resource: repo://apps/rpc/src/features/ai/Service.ts
  - id: openwiki-source-107e7ad22a600460284410a2
    resource: repo://apps/rpc/src/features/attempt/Coach.ts
  - id: openwiki-source-3b0cff6f473e94546e112b49
    resource: repo://apps/rpc/src/platform/RateLimiter.ts
  - id: openwiki-source-2524714ba97be380a6517ae1
    resource: repo://packages/contract/src/attempt.ts
  - id: openwiki-source-2ca451ca1cb61362216ced17
    resource: repo://packages/contract/src/session.ts
  - id: openwiki-source-a940762bd452dafaa8320a97
    resource: repo://packages/domain/src/ai.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# AI assistance

Three uses, all behind the organization's own API keys and all advisory: nothing is graded or saved until a teacher applies it, and students never see drafts or suggestions.

## Keys per organization (`features/ai/Service.ts`, `helpers.ts`)

- Providers: `openai`, `anthropic`, `gemini` (`packages/domain/ai.ts#aiProviders`), one key per provider and organization in `ai_keys`, with a default model per provider (`defaultAiModels`) that the key may override.
- Keys are stored **encrypted with AES-256-GCM**; the encryption key is derived from `BETTER_AUTH_SECRET` with HKDF (`info` `examinus-ai-keys`), and the stored value is `base64(iv | tag | ciphertext)`. Only the last four characters (`last4`) are ever returned. Rotating `BETTER_AUTH_SECRET` makes stored keys undecryptable, so they must be re-entered.
- `ai.keys`, `ai.setKey`, `ai.removeKey` need the organization permission `ai: ["configure"]` (owners and admins, `/teacher/organization/ai`); `ai.status`, `ai.generate` and `ai.suggestGrade` need `ai: ["use"]` (teachers). `ai.status` lists the providers the organization has keys for so the UI only offers those.

## Drafting questions

`ai.generate { provider, prompt/notes, types, difficulty, points, count }` asks the model for flat **drafts** (`AiDraft`: a prompt plus type-specific fields) and turns each into a real question with `draftQuestion(raw, points, newId)`, which looks the type's kind up and calls its `draft.decode`; a draft with an empty prompt, an unknown type or a shape the kind rejects is dropped. Only the six types with a draft shape are generatable: multiple choice, true/false, blank (identification), enumeration, numeric and essay (with a rubric). The same decoder serves the question bank's AI button (`bank.add` of the ticked drafts) and the MCP server's `add_questions`/`add_bank_questions`, so every path produces identical questions. Drafts land in a quiz part or the bank for the teacher to edit; nothing is saved until the quiz is.

Rate limit: 30 generations per teacher per hour (`limits.aiGenerate`).

## Grading suggestions

On the grading page, `ai.suggestGrade` drafts a score, feedback and the rubric rows met for one essay answer (or every ungraded essay in the session), in a Standard or **Caveman** feedback style (short blunt fragments; the prompt insists on accuracy and respect). `essayToGrade` resolves the answer the teacher may grade; the suggestion is stored on the answer (`answers.ai_suggestion`) with a key of the answer's value and returned to teachers in `AttemptDetail.aiSuggestions` until the answer changes. Applying it is a normal `session.grade` call. Limit: 400 suggestions per teacher per hour (`limits.aiGrade`).

## The student coach (`features/attempt/Coach.ts`)

After a released result, `attempt.coach` gives the student a short report on their performance. `analyzeAttempt` (`packages/domain/analytics.ts`) builds per-topic analytics from the result; `Ai.coach` asks the organization's model for a report within `coachMaxWords`, and `fallbackCoach` produces a rule-based report when there is no key, the model is slow or fails, or the teacher's quota is spent — the response says which (`source: "ai" | "rules"`). The report is cached on the attempt (`attempts.coach_report`) under a key of the attempt id and score, so it is regenerated only when the score changes.

## Failure behaviour

Provider calls run with timeouts and return typed `AiProviderError`/`AiFailed`; the UI shows the message and the teacher continues by hand. Metrics count AI calls and failures per provider (Grafana "Runner and AI"), without prompts or answers.
