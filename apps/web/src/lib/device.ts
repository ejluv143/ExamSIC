// The random token that ties an attempt to one browser. It lives in a cookie so the server can read it when it
// renders the exam, and the exam sends it with every call. Clearing cookies mid-exam locks the student out of
// that attempt (the API refuses a different token), which is the point.
export const deviceCookie = "examora_device";

// This browser's token, created the first time it is asked for. Browser only.
export function getDeviceId(): string {
  const found = document.cookie.split("; ").find((c) => c.startsWith(`${deviceCookie}=`));
  if (found) return found.slice(deviceCookie.length + 1);
  const id = crypto.randomUUID();
  document.cookie = `${deviceCookie}=${id}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`;
  return id;
}
