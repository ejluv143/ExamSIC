import { describe, expect, test } from "bun:test";
import { NotFound } from "@examinus/contract/errors";
import { defaultAiModels, type AiProvider } from "@examinus/domain/ai";
import { Effect, Layer, Redacted } from "effect";
import type { AttemptItem, QuestionItem } from "../../database/schemas/index.ts";
import { AppConfig } from "../../platform/AppConfig.ts";
import { harness, stub, testConfig } from "../../testing/config.ts";
import { aiKeyRow, attemptRow, questionRow } from "../../testing/rows.ts";
import { AiRepo, type AiKeyRow } from "./Repo.ts";
import { Ai } from "./Service.ts";

type KeyStore = { rows: Map<AiProvider, AiKeyRow>; repo: Layer.Layer<AiRepo> };

// The keys table, shared by every Ai built on it.
const keyStore = (): KeyStore => {
  const rows = new Map<AiProvider, AiKeyRow>();
  const repo = Layer.succeed(
    AiRepo,
    stub<AiRepo["Service"]>("AiRepo", {
      keys: Effect.sync(() => [...rows.values()]),
      saveKey: (provider, values) =>
        Effect.sync(() => {
          const row = aiKeyRow({ id: `key-${provider}`, provider, ...values });
          rows.set(provider, row);
          return row;
        }),
      setModel: (provider, model) =>
        Effect.sync(() => {
          const row = rows.get(provider);
          if (!row) return null;
          const changed = { ...row, model };
          rows.set(provider, changed);
          return changed;
        }),
      removeKey: (provider) => Effect.sync(() => void rows.delete(provider)),
    }),
  );
  return { rows, repo };
};

// An Ai over the store, signing keys with the config's auth secret (the default, or another one).
const aiOver = (store: KeyStore, secret?: string) => {
  const config = secret
    ? Layer.effect(
        AppConfig,
        Effect.map(Effect.service(AppConfig), (base) => AppConfig.of({ ...base, auth: { ...base.auth, secret: Redacted.make(secret) } })),
      ).pipe(Layer.provide(testConfig))
    : testConfig;
  return harness(Ai.layer.pipe(Layer.provide([store.repo, config])));
};

const ai = Effect.service(Ai);

describe("Ai keys", () => {
  test("a saved key is trimmed, kept encrypted, and only its last four characters and model come back", async () => {
    const store = keyStore();
    const { run } = aiOver(store);
    const info = await run(Effect.flatMap(ai, (a) => a.setKey("openai", "  sk-secret-1234  ", "  gpt-x  ")));
    expect(info).toMatchObject({ provider: "openai", last4: "1234", model: "gpt-x" });
    expect(Object.keys(info).sort()).toEqual(["last4", "model", "provider", "updatedAt"]);
    const stored = store.rows.get("openai")!;
    expect(stored.secret).not.toContain("sk-secret-1234");
    expect(stored.secret).not.toBe("");
  });

  test("a blank model falls back to the provider's default", async () => {
    const { run } = aiOver(keyStore());
    const info = await run(Effect.flatMap(ai, (a) => a.setKey("gemini", "gm-key-0000", "   ")));
    expect(info.model).toBe(defaultAiModels.gemini);
  });

  test("the saved key resolves back to exactly what was typed, with its model", async () => {
    const { run } = aiOver(keyStore());
    const key = await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey("anthropic", " sk-ant-abcd ", "claude-x");
        return yield* a.resolve("anthropic");
      }),
    );
    expect(key).toEqual({ provider: "anthropic", apiKey: "sk-ant-abcd", model: "claude-x" });
  });

  test("changing only the model keeps the key; with no key saved it is NotFound", async () => {
    const { run, fail } = aiOver(keyStore());
    const err = await fail(Effect.flatMap(ai, (a) => a.setKey("openai", undefined, "gpt-y")));
    expect(err).toBeInstanceOf(NotFound);
    const key = await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey("openai", "sk-first-1111", "gpt-x");
        const info = yield* a.setKey("openai", undefined, "gpt-y");
        expect(info).toMatchObject({ last4: "1111", model: "gpt-y" });
        return yield* a.resolve("openai");
      }),
    );
    expect(key.apiKey).toBe("sk-first-1111");
  });

  test("keys are listed in the fixed provider order, whatever order they were saved in", async () => {
    const { run } = aiOver(keyStore());
    const providers = await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey("gemini", "gm-key-0000", "");
        yield* a.setKey("openai", "sk-key-0000", "");
        return (yield* a.keys).map((k) => k.provider);
      }),
    );
    expect(providers).toEqual(["openai", "gemini"]);
  });

  test("resolving a provider with no key fails with AiFailed naming the provider", async () => {
    const { fail } = aiOver(keyStore());
    const err = await fail(Effect.flatMap(ai, (a) => a.resolve("anthropic")));
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("Claude");
  });

  test("removing a key makes the provider unavailable", async () => {
    const { run, fail } = aiOver(keyStore());
    await run(
      Effect.gen(function* () {
        const a = yield* ai;
        yield* a.setKey("openai", "sk-key-0000", "");
        yield* a.removeKey("openai");
      }),
    );
    const err = await fail(Effect.flatMap(ai, (a) => a.resolve("openai")));
    expect(err._tag).toBe("AiFailed");
  });

  test("a key saved under another auth secret can't be decrypted: it is missing, not an error, and not offered", async () => {
    const store = keyStore();
    await aiOver(store, "an-older-secret-an-older-secret-0000").run(
      Effect.flatMap(ai, (a) => a.setKey("openai", "sk-old-key-9999", "")),
    );
    await aiOver(store).run(Effect.flatMap(ai, (a) => a.setKey("gemini", "gm-new-key-8888", "")));
    const current = aiOver(store);
    const err = await current.fail(Effect.flatMap(ai, (a) => a.resolve("openai")));
    expect(err._tag).toBe("AiFailed");
    const options = await current.run(Effect.flatMap(ai, (a) => a.options));
    expect(options).toEqual([{ provider: "gemini", model: defaultAiModels.gemini }]);
    // The admin still sees that a key row exists, so they can replace it.
    const listed = await current.run(Effect.flatMap(ai, (a) => a.keys));
    expect(listed.map((k) => k.provider)).toEqual(["openai", "gemini"]);
  });
});

describe("Ai.coach", () => {
  test("with no school key set up it fails with AiFailed before any provider is called", async () => {
    const { fail } = aiOver(keyStore());
    const err = await fail(Effect.flatMap(ai, (a) => a.coach({} as Parameters<typeof a.coach>[0])));
    expect(err._tag).toBe("AiFailed");
  });
});

describe("Ai.essayToGrade", () => {
  type Setup = {
    owned?: boolean;
    question?: QuestionItem | null;
    status?: AttemptItem["status"];
    answer?: unknown;
  };

  const essayOver = (options: Setup = {}) => {
    const repo = Layer.succeed(
      AiRepo,
      stub<AiRepo["Service"]>("AiRepo", {
        ownAttempt: (attemptId, userId) =>
          Effect.succeed(
            (options.owned ?? true) && attemptId === "attempt-1" && userId === "teacher-1"
              ? { attempt: attemptRow({ status: options.status ?? "needs_grading" }), quizId: "quiz-1" }
              : null,
          ),
        quizQuestion: (questionId, quizId) =>
          Effect.succeed(quizId === "quiz-1" && questionId === "q-1" ? (options.question === undefined ? questionRow() : options.question) : null),
        answerValue: () => Effect.succeed("answer" in options ? options.answer : "An essay."),
      }),
    );
    return harness(Ai.layer.pipe(Layer.provide([repo, testConfig])));
  };

  const grade = (questionId = "q-1") => Effect.flatMap(ai, (a) => a.essayToGrade("teacher-1", "attempt-1", questionId));

  test("a submitted essay answer is returned with its question", async () => {
    const { run } = essayOver();
    const result = await run(grade());
    expect(result.answer).toBe("An essay.");
    expect(result.question).toMatchObject({ id: "q-1", type: "essay", points: 10 });
  });

  test("an attempt of someone else's quiz is NotFound", async () => {
    const err = await essayOver({ owned: false }).fail(grade());
    expect(err._tag).toBe("NotFound");
  });

  test("a question that isn't in the attempt's quiz is NotFound", async () => {
    const err = await essayOver().fail(grade("q-other"));
    expect(err._tag).toBe("NotFound");
  });

  test("only essay questions can be suggested a score", async () => {
    const choice = questionRow({
      type: "true_false",
      body: { type: "true_false", answer: true },
    });
    const err = await essayOver({ question: choice }).fail(grade());
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("essay");
  });

  test("an attempt still in progress is refused", async () => {
    const err = await essayOver({ status: "in_progress" }).fail(grade());
    expect(err._tag).toBe("AiFailed");
    expect(err.message).toContain("submitted");
  });

  test.each([["no answer", undefined], ["a blank answer", "   \n"], ["a non-text answer", ["a"]]])(
    "%s is refused as empty",
    async (_label, answer) => {
      const err = await essayOver({ answer }).fail(grade());
      expect(err._tag).toBe("AiFailed");
    },
  );
});
