// Next.js calls register() once when the server starts. It turns on OpenTelemetry tracing for the Node.js runtime
// only when OTEL_EXPORTER_OTLP_ENDPOINT is set; without it nothing is installed and nothing is exported.
// @vercel/otel reads the endpoint, OTEL_EXPORTER_OTLP_HEADERS, OTEL_RESOURCE_ATTRIBUTES and OTEL_TRACES_SAMPLER*
// from the environment, and patches fetch, which is also how API calls get their trace context (see lib/api/client.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  // Imported here, not at the top: register() also runs in the edge runtime, which can't load the Node.js SDK.
  const { registerOTel } = await import("@vercel/otel");
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || "examinus-web",
    // Trace context is only sent to the app's own deployment URLs by default; the API is another origin.
    instrumentationConfig: { fetch: { propagateContextUrls: process.env.API_URL ? [process.env.API_URL] : [] } },
  });
}
