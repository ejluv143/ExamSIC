import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NotFound } from "@examinus/contract/errors";
import { defaultAiModels, type AiProvider } from "@examinus/domain/ai";
import { Effect, Layer, Redacted } from "effect";
import type { AttemptItem, QuestionItem } from "../../database/schemas/index.ts";
import { AppConfig } from "../../platform/AppConfig.ts";
import { limits } from "../../platform/RateLimiter.ts";
import { harness, stub, testConfig } from "../../testing/config.ts";
import { fakeRateLimiter } from "../../testing/rateLimiter.ts";
import { aiKeyRow, attemptRow, questionRow } from "../../testing/rows.ts";
import { AiRepo, type AiKeyRow } from "./Repo.ts";
import { Ai } from "./Service.ts";

const org = "org-1";

type KeyStore = { rows: Map<string, AiKeyRow>; repo: Layer.Layer<AiRepo> };

const slot = (organizationId: string, provider: AiProvider) => `${organizationId}/${provider}`;

// The keys table, shared by every Ai built on it, keyed by organization and provider.
const keyStore = (extra: Partial<AiRepo["Service"]> = {}): KeyStore => {
  const rows = new Map<string, AiKeyRow>();
  const repo = Layer.succeed(
    AiRepo,
    stub<AiRepo["Service"]>("AiRepo", {
      keys: (organizationId) =>
        Effect.sync(() => [...rows.values()].filter((r) => r.organizationId === organizationId)),
      saveKey: (organizationId, provider, values) =>
        Effect.sync(() => {
          const row = aiKeyRow({ id: `key-${slot(organizationId, provider)}`, organizationId, provider, ...values });
          rows.set(slot(organizationId, provider), row);
          return row;
        }),
      setModel: (organizationId, provider, model) =>
        Effect.sync(() => {
          const row = rows.get(slot(organizationId, provider));
          if (!row) return null;
          const changed = { ...row, model };
          rows.set(slot(organizationId, provider), changed);
          return changed;
        }),
      removeKey: (organizationId, provider) => Effect.sync(() => void rows.delete(slot(organizationId, provider))),
      ...extra,
    }),
  );
  return { rows, repo };
};

// The providers' endpoints, stubbed: every call is recorded, and each provider answers with one usable question (or
// with `status` when set). A key is "used" when it is the one the call carried.
type ProviderCall = { url: string; apiKey: string; model: string | undefined; body: unknown };
const providers = { calls: [] as ProviderCall[], status: 200, reply: undefined as unknown };
const realFetch = globalThis.fetch;

const draft = { type: "true_false", prompt: "The sky is blue.", answer: true };
const gradeReply = { score: 7.3, feedback: " Good. ", rubricRowIds: [] };

// What a provider wraps a JSON answer in.
const wrap = (url: string, answer: unknown) => {
  if (url.includes("openai")) return { choices: [{ message: { content: JSON.stringify(answer) } }] };
  if (url.includes("anthropic")) return { content: [{ type: "tool_use", input: answer }] };
  return { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] };
};

beforeEach(() => {
  providers.calls = [];
  providers.status = 200;
  providers.reply = undefined;
  globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as { model?: string };
    providers.calls.push({
      url,
      apiKey: headers.get("x-api-key") ?? headers.get("x-goog-api-key") ?? headers.get("authorization")?.replace("Bearer ", "") ?? "",
      model: body.model,
      body,
    });
    if (providers.status !== 200) return new Response("nope", { status: providers.status });
    return Response.json(wrap(url, providers.reply ?? { questions: [draft] }));
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// An Ai over the store, signing keys with the config's auth secret (the default, or another one).
const aiOver = (store: KeyStore, secret?: string) => {
  const config = secret
    ? Layer.effect(
        AppConfig,
        Effect.map(Effect.service(AppConfig), (base) => AppConfig.of({ ...base, auth: { ...base.auth, secret: Redacted.make(secret) } })),
      ).pipe(Layer.provide(testConfig))
    : testConfig;
  const limiter = fakeRateLimiter();
  return { ...harness(Ai.layer.pipe(Layer.provide([store.repo, config, limiter.layer]))), limiter };
};

const ai = Effect.service(Ai);

const teacher = { id: "teacher-1", organizationId: org };
const request = (provider: AiProvider) => ({
  provider,
  instructions: "Skies",
  count: 3,
  types: ["true_false" as const],
  difficulty: "easy" as const,
  points: 2,
});
// Asks the organization's key for `provider` to write questions, as a way to see which key the call went out with.
const generate = (organizationId: string, provider: AiProvider) =>
  Effect.flatMap(ai, (a) => a.generate({ id: teacher.id, organizationId }, request(provider)));
const lastCall = () => providers.calls.at(-1);

describe("Ai keys", () => {
  test("a saved key is trimmed, kept encrypted, and only its last four characters and model come back", async () => {
    const store = keyStore();
    const { run } = aiOver(store);
    const info = await run(Effect.flatMap(ai, (a) => a.setKey(org, "openai", "  sk-secret-1234  ", "  gpt-x  ")));
    expect(info).toMatchObject({ provider: "openai", last4: "1234", model: "gpt-x" });
    expect(Object.keys(info).sort()).toEqual(["last4", "model", "provider", "updatedAt"]);
    const stored = store.rows.get(slot(org, "openai"))!;
    expect(stored.secret).not.toContain("sk-secret-1234");
    expect(stored.secret).not.toBe("");
  });

  test("a blank model falls back to the provider's default", async () => {
    const { run } = aiOver(keyStore());
    const info = await run(Effect.flatMap(ai, (a) => a.setKey(org, "gemini", "gm-key-0000", "   ")));
    expect(info.model).toBe(defaultAiModels.gemini);
  });

  test("the saved key goes to its provider exactly as typed, with its model", async () => {
    const { run } = aiOver(keyStore());
    await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey(org, "anthropic", " sk-ant-abcd ", "claude-x");
        yield* generate(org, "anthropic");
      }),
    );
    expect(lastCall()).toMatchObject({ url: "https://api.anthropic.com/v1/messages", apiKey: "sk-ant-abcd", model: "claude-x" });
  });

  test("changing only the model keeps the key; with no key saved it is NotFound", async () => {
    const { run, fail } = aiOver(keyStore());
    const err = await fail(Effect.flatMap(ai, (a) => a.setKey(org, "openai", undefined, "gpt-y")));
    expect(err).toBeInstanceOf(NotFound);
    await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey(org, "openai", "sk-first-1111", "gpt-x");
        const info = yield* a.setKey(org, "openai", undefined, "gpt-y");
        expect(info).toMatchObject({ last4: "1111", model: "gpt-y" });
        yield* generate(org, "openai");
      }),
    );
    expect(lastCall()).toMatchObject({ apiKey: "sk-first-1111", model: "gpt-y" });
  });

  test("keys are listed in the fixed provider order, whatever order they were saved in", async () => {
    const { run } = aiOver(keyStore());
    const providers = await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey(org, "gemini", "gm-key-0000", "");
        yield* a.setKey(org, "openai", "sk-key-0000", "");
        return (yield* a.keys(org)).map((k) => k.provider);
      }),
    );
    expect(providers).toEqual(["openai", "gemini"]);
  });

  test("a provider with no key fails with AiFailed naming the provider, before any call or limit is spent", async () => {
    const { fail, limiter } = aiOver(keyStore());
    const err = await fail(generate(org, "anthropic"));
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("Claude");
    expect(providers.calls).toEqual([]);
    expect(limiter.used(limits.aiGenerate, teacher.id)).toBe(0);
  });

  test("removing a key makes the provider unavailable", async () => {
    const { run, fail } = aiOver(keyStore());
    await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey(org, "openai", "sk-key-0000", "");
        yield* a.removeKey(org, "openai");
      }),
    );
    const err = await fail(generate(org, "openai"));
    expect(err._tag).toBe("AiFailed");
  });

  test("a key saved under another auth secret can't be decrypted: it is missing, not an error, and not offered", async () => {
    const store = keyStore();
    await aiOver(store, "an-older-secret-an-older-secret-0000").run(
      Effect.flatMap(ai, (a) => a.setKey(org, "openai", "sk-old-key-9999", "")),
    );
    await aiOver(store).run(Effect.flatMap(ai, (a) => a.setKey(org, "gemini", "gm-new-key-8888", "")));
    const current = aiOver(store);
    const err = await current.fail(generate(org, "openai"));
    expect(err._tag).toBe("AiFailed");
    const options = await current.run(Effect.flatMap(ai, (a) => a.options(org)));
    expect(options).toEqual([{ provider: "gemini", model: defaultAiModels.gemini }]);
    // The admin still sees that a key row exists, so they can replace it.
    const listed = await current.run(Effect.flatMap(ai, (a) => a.keys(org)));
    expect(listed.map((k) => k.provider)).toEqual(["openai", "gemini"]);
  });
});

describe("Ai keys per organization", () => {
  test("another organization's keys are neither listed, offered nor resolved", async () => {
    const { run, fail } = aiOver(keyStore());
    await run(Effect.flatMap(ai, (a) => a.setKey(org, "openai", "sk-key-0000", "")));
    expect(await run(Effect.flatMap(ai, (a) => a.keys("org-2")))).toEqual([]);
    expect(await run(Effect.flatMap(ai, (a) => a.options("org-2")))).toEqual([]);
    const err = await fail(generate("org-2", "openai"));
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("Ask an organization admin to add one.");
  });

  test("the same provider can hold a different key in each organization", async () => {
    const { run } = aiOver(keyStore());
    await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey(org, "openai", "sk-aaaa-1111", "");
        yield* a.setKey("org-2", "openai", "sk-bbbb-2222", "");
        yield* generate(org, "openai");
        yield* generate("org-2", "openai");
      }),
    );
    expect(providers.calls.map((c) => c.apiKey)).toEqual(["sk-aaaa-1111", "sk-bbbb-2222"]);
  });
});

describe("Ai.coach", () => {
  test("with no organization key set up it fails with AiFailed before any provider is called", async () => {
    const { fail } = aiOver(keyStore());
    const err = await fail(Effect.flatMap(ai, (a) => a.coach(org, {} as Parameters<typeof a.coach>[1])));
    expect(err._tag).toBe("AiFailed");
  });

  test("in the personal space (no organization) there is no key: AiFailed", async () => {
    const { fail } = aiOver(keyStore());
    const err = await fail(Effect.flatMap(ai, (a) => a.coach(null, {} as Parameters<typeof a.coach>[1])));
    expect(err._tag).toBe("AiFailed");
  });
});

describe("Ai.generate", () => {
  test("it asks the provider for the questions, and keeps no more than were asked for", async () => {
    const { run } = aiOver(keyStore());
    providers.reply = { questions: [draft, draft, { ...draft, prompt: "Grass is red." }] };
    const questions = await run(
      Effect.gen(function* () {
        yield* (yield* ai).setKey(org, "openai", "sk-key-0000", "");
        return yield* Effect.flatMap(ai, (a) => a.generate(teacher, { ...request("openai"), count: 2 }));
      }),
    );
    expect(questions.map((q) => q.prompt)).toEqual(["The sky is blue.", "The sky is blue."]);
    expect(questions[0]).toMatchObject({ type: "true_false", points: 2 });
    expect(providers.calls).toHaveLength(1);
  });

  test("it spends the teacher's hourly limit only once a key is found, and refuses when it is used up", async () => {
    const { run, fail, limiter } = aiOver(keyStore());
    await run(Effect.flatMap(ai, (a) => a.setKey(org, "openai", "sk-key-0000", "")));
    await run(generate(org, "openai"));
    expect(limiter.used(limits.aiGenerate, teacher.id)).toBe(1);
    for (let i = 1; i < limits.aiGenerate.max; i++) await run(generate(org, "openai"));
    const err = await fail(generate(org, "openai"));
    expect(err._tag).toBe("TooManyRequests");
    expect(providers.calls).toHaveLength(limits.aiGenerate.max);
  });

  test.each([
    [401, "rejected the API key"],
    [403, "rejected the API key"],
    [429, "rate limiting"],
    [404, "doesn't know the model"],
    [500, "error 500"],
  ])("a provider answering %d becomes AiFailed saying so", async (status, text) => {
    const { run, fail } = aiOver(keyStore());
    await run(Effect.flatMap(ai, (a) => a.setKey(org, "gemini", "gm-key-0000", "")));
    providers.status = status;
    const err = await fail(generate(org, "gemini"));
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain(text);
    expect(err.message).toContain("Gemini");
  });

  test("a reply with no usable questions becomes AiFailed", async () => {
    const { run, fail } = aiOver(keyStore());
    await run(Effect.flatMap(ai, (a) => a.setKey(org, "openai", "sk-key-0000", "")));
    providers.reply = { questions: [{ type: "unknown_type", prompt: "x" }] };
    const err = await fail(generate(org, "openai"));
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("didn't return questions");
  });

  test("a provider that can't be reached becomes AiFailed", async () => {
    const { run, fail } = aiOver(keyStore());
    await run(Effect.flatMap(ai, (a) => a.setKey(org, "openai", "sk-key-0000", "")));
    globalThis.fetch = (async () => {
      throw new TypeError("connection refused");
    }) as unknown as typeof fetch;
    const err = await fail(generate(org, "openai"));
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("Couldn't reach OpenAI");
  });
});

describe("Ai.suggestGrade", () => {
  type Setup = {
    owned?: boolean;
    question?: QuestionItem | null;
    status?: AttemptItem["status"];
    answer?: unknown;
  };

  // An Ai whose teacher has an OpenAI key, over one attempt; `saved` holds what was kept on the answer.
  const essayOver = (options: Setup = {}) => {
    const saved: Array<{ attemptId: string; questionId: string; score: number; answer: string }> = [];
    const store = keyStore({
      ownAttempt: (attemptId, actor) =>
        Effect.succeed(
          (options.owned ?? true) && attemptId === "attempt-1" && actor.id === "teacher-1" && actor.organizationId === org
            ? { attempt: attemptRow({ status: options.status ?? "needs_grading" }), quizId: "quiz-1" }
            : null,
        ),
      quizQuestion: (questionId, quizId) =>
        Effect.succeed(quizId === "quiz-1" && questionId === "q-1" ? (options.question === undefined ? questionRow() : options.question) : null),
      answerValue: () => Effect.succeed("answer" in options ? options.answer : "An essay."),
      saveSuggestion: (attemptId, questionId, suggestion, answer) =>
        Effect.sync(() => void saved.push({ attemptId, questionId, score: suggestion.score, answer })),
    });
    const over = aiOver(store);
    const grade = (questionId = "q-1", provider: AiProvider = "openai") =>
      Effect.gen(function* () {
        const a = yield* ai;
        if (store.rows.size === 0) yield* a.setKey(org, "openai", "sk-key-0000", "");
        return yield* a.suggestGrade(teacher, { attemptId: "attempt-1", questionId, provider, feedbackStyle: "standard" });
      });
    return { ...over, grade, saved };
  };

  test("a submitted essay answer is graded by the provider: score in half points, kept on the answer", async () => {
    const { run, grade, saved, limiter } = essayOver();
    providers.reply = gradeReply;
    const suggestion = await run(grade());
    expect(suggestion).toMatchObject({ provider: "openai", score: 7.5, feedback: "Good.", rubricRowIds: [] });
    expect(saved).toEqual([{ attemptId: "attempt-1", questionId: "q-1", score: 7.5, answer: "An essay." }]);
    expect(limiter.used(limits.aiGrade, teacher.id)).toBe(1);
    expect(JSON.stringify(lastCall()?.body)).toContain("An essay.");
  });

  test("a score above the question's points is cut to them", async () => {
    const { run, grade } = essayOver();
    providers.reply = { ...gradeReply, score: 99 };
    expect((await run(grade())).score).toBe(10);
  });

  test("a reply with no score is AiFailed and nothing is kept", async () => {
    const { fail, grade, saved } = essayOver();
    providers.reply = { feedback: "no score" };
    const err = await fail(grade());
    expect(err._tag).toBe("AiFailed");
    expect(saved).toEqual([]);
  });

  test("a provider failure is AiFailed and nothing is kept", async () => {
    const { fail, grade, saved } = essayOver();
    providers.status = 401;
    const err = await fail(grade());
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("rejected the API key");
    expect(saved).toEqual([]);
  });

  test("with no key for the provider nothing is called and no limit is spent", async () => {
    const { fail, grade, limiter } = essayOver();
    const err = await fail(grade("q-1", "anthropic"));
    expect(err._tag).toBe("AiFailed");
    expect(providers.calls).toEqual([]);
    expect(limiter.used(limits.aiGrade, teacher.id)).toBe(0);
  });

  test("an attempt of someone else's quiz is NotFound, and the provider isn't called", async () => {
    const { fail, grade } = essayOver({ owned: false });
    const err = await fail(grade());
    expect(err._tag).toBe("NotFound");
    expect(providers.calls).toEqual([]);
  });

  test("a question that isn't in the attempt's quiz is NotFound", async () => {
    const { fail, grade } = essayOver();
    const err = await fail(grade("q-other"));
    expect(err._tag).toBe("NotFound");
  });

  test("only essay questions can be suggested a score", async () => {
    const choice = questionRow({ type: "true_false", body: { type: "true_false", answer: true } });
    const { fail, grade } = essayOver({ question: choice });
    const err = await fail(grade());
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("essay");
  });

  test("an attempt still in progress is refused", async () => {
    const { fail, grade } = essayOver({ status: "in_progress" });
    const err = await fail(grade());
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("submitted");
  });

  test.each([["no answer", undefined], ["a blank answer", "   \n"], ["a non-text answer", ["a"]]])(
    "%s is refused as empty",
    async (_label, answer) => {
      const { fail, grade } = essayOver({ answer });
      const err = await fail(grade());
      expect(err._tag).toBe("AiFailed");
      expect(providers.calls).toEqual([]);
    },
  );
});
