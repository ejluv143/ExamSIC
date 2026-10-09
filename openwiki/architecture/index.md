# Files

- [API server (apps/rpc)](api-server.md) - How the Effect 4 API on Bun is composed from services and layers, which HTTP routes it serves (/rpc, /rpc/live, /api/auth/*, /health), the background jobs it runs, and the conventions handlers follow.
- [System architecture overview](overview.md) - How Examinus (code name examora) is split into a Next.js web app, an Effect RPC API on Bun, a Docker code runner and a shared contract package, and how a browser request travels to PostgreSQL, S3 and the runner.
- [RPC contract package](rpc-contract.md) - packages/contract (@examora/contract) defines every Effect RPC group, payload schema and tagged error shared by the web app and the API, plus pure domain logic such as scoring, seeded shuffling, join keys and code similarity.
- [Web app (apps/web)](web-app.md) - Structure of the Next.js 16 web app — role areas, marketing pages, the server-only data layer that calls the API, server actions, Excel export routes, the proxy, and the browser-side runtimes it ships.
