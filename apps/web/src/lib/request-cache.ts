// One result per request for a server-side read, like React's `cache()`, which only dedupes inside React's render.
// vinext also calls layouts and the server components under them directly, before rendering, to see which layouts it
// may skip (its layout probe, vinext/dist/server/app-page-probe.js), once per layout level; there `cache()` remembers
// nothing, and a read in the user menu ran once per probe and again in the render (issue #49). `headers()` is the same
// object for the whole request, probe and render alike, so results are kept against it, and go with the request.
// Only while rendering: a server action (or route handler) reads afresh, as `cache()` would, so a page rendered after
// an action that changed something (the active organization, say) never sees what the action read before it.
import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { getHeadersAccessPhase } from "vinext/shims/headers";

export function requestCache<A extends unknown[], R>(read: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  const byRequest = new WeakMap<object, Map<string, Promise<R>>>();
  return cache(async (...args: A) => {
    if (getHeadersAccessPhase() !== "render") return read(...args);
    const request = await headers();
    let results = byRequest.get(request);
    if (!results) byRequest.set(request, (results = new Map()));
    const key = JSON.stringify(args);
    let result = results.get(key);
    if (!result) results.set(key, (result = read(...args)));
    return result;
  });
}
