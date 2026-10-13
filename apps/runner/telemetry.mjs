// @ts-check
// OpenTelemetry for the runner. Only loaded (dynamic import in server.mjs) when OTEL_EXPORTER_OTLP_ENDPOINT is set,
// so without it none of the SDK code is read. The SDK reads the OTLP/HTTP endpoint, headers, resource attributes and
// service name from the standard OTEL_* environment variables.
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NodeSDK } from "@opentelemetry/sdk-node";

process.env.OTEL_SERVICE_NAME ||= "examinus-runner";
// Metrics are pushed every 15 s (the SDK's default is 60 s).
process.env.OTEL_METRIC_EXPORT_INTERVAL ||= "15000";

const sdk = new NodeSDK({ instrumentations: [new HttpInstrumentation()] });
sdk.start();

// No unit on purpose: a unit would be appended to the Prometheus name.
const meter = metrics.getMeter("examinus-runner");
const jobDuration = meter.createHistogram("examinus_runner_job_duration_ms", {
  description: "Time from receiving a job to its result, queue wait included.",
  advice: { explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000] },
});
const jobsActive = meter.createUpDownCounter("examinus_runner_jobs_active", { description: "Jobs being handled right now." });
const tracer = trace.getTracer("examinus-runner");

/** Outcome of a finished job, from the object `run` returns. */
const outcomeOf = (/** @type {any} */ result) => ("compileError" in result ? "compile_error" : "error" in result ? "error" : "ok");

/**
 * Wraps one job in a `runner.job` span and records its duration. Never puts code or output in attributes.
 * @template T
 * @param {string} language
 * @param {number} testCount
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function traceJob(language, testCount, fn) {
  const started = performance.now();
  jobsActive.add(1);
  return tracer.startActiveSpan("runner.job", { attributes: { language, tests: testCount } }, async (span) => {
    let outcome = "error";
    try {
      const result = await fn();
      outcome = outcomeOf(result);
      return result;
    } catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: e instanceof Error ? e.message : "failed" });
      throw e;
    } finally {
      span.setAttribute("outcome", outcome);
      span.end();
      jobsActive.add(-1);
      jobDuration.record(performance.now() - started, { language, outcome });
    }
  });
}

/**
 * Wraps one `docker run` in a child span.
 * @param {() => Promise<{ exitCode: number | null, killed: boolean }>} fn
 */
export function traceContainer(fn) {
  return tracer.startActiveSpan("docker run", async (span) => {
    try {
      const result = await fn();
      span.setAttributes({ exit_code: result.exitCode ?? -1, timed_out: result.killed });
      // 125-127: docker itself failed (daemon error, image missing), not the student's program.
      if (result.exitCode !== null && result.exitCode >= 125 && result.exitCode <= 127)
        span.setStatus({ code: SpanStatusCode.ERROR, message: `docker exited ${result.exitCode}` });
      return result;
    } catch (e) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: e instanceof Error ? e.message : "failed" });
      throw e;
    } finally {
      span.end();
    }
  });
}

/** A job refused before it ran (bad request). */
export function recordRejected(/** @type {string} */ language) {
  jobDuration.record(0, { language, outcome: "rejected" });
}

/** Flushes pending spans and metrics. */
export const shutdown = () => sdk.shutdown();
