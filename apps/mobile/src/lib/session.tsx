// Who is signed in. The API's own view of the user (`auth.session`: role, memberships, active organization) decides
// what the app shows, not Better Auth's.
import type { SessionUser } from "@examinus/domain/user";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, callApi, callResult, setOnUnauthorized } from "./api";
import { forgetSession, getToken, signInWithEmail, signInWithGoogle } from "./auth";

type State = { status: "loading" } | { status: "out" } | { status: "in"; user: SessionUser };

type SessionApi = {
  state: State;
  // Each returns an error message for the person, or null when it worked.
  signIn: (email: string, password: string) => Promise<string | null>;
  signInGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  // Switches the active organization (null: the personal space).
  setOrganization: (organizationId: string | null) => Promise<string | null>;
};

const SessionContext = createContext<SessionApi | null>(null);

// A person with no active organization (right after signing in) works in the one they belong to; with several, in
// one where they are a student. With no student role anywhere, the teacher screen shows.
async function withOrganization(user: SessionUser): Promise<SessionUser> {
  if (user.organization !== null || user.role === "admin" || user.role === "guest") return user;
  const target = user.memberships.length === 1 ? user.memberships[0] : user.memberships.find((m) => m.roles.includes("student"));
  if (target === undefined) return user;
  try {
    return await callApi((api) => api["org.setActive"]({ organizationId: target.id }));
  } catch {
    return user;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });

  // Reads the session from the API. A token the API refuses is forgotten; an unreachable API leaves the app on sign-in
  // with the token kept, so a dropped connection doesn't sign anyone out.
  const load = useCallback(async () => {
    if (!(await getToken())) return setState({ status: "out" });
    try {
      const { user } = await callApi((api) => api["auth.session"]());
      setState({ status: "in", user: await withOrganization(user) });
    } catch (error) {
      if (error instanceof ApiError) await forgetSession();
      setState({ status: "out" });
    }
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      void forgetSession().then(() => setState({ status: "out" }));
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the session once when the app opens
    void load();
  }, [load]);

  const api = useMemo<SessionApi>(
    () => ({
      state,
      signIn: async (email, password) => {
        const error = await signInWithEmail(email, password);
        if (error === null) await load();
        return error;
      },
      signInGoogle: async () => {
        const error = await signInWithGoogle();
        if (error === null) await load();
        return error;
      },
      signOut: async () => {
        await callResult((rpc) => rpc["auth.signOut"]()).catch(() => undefined);
        await forgetSession();
        setState({ status: "out" });
      },
      setOrganization: async (organizationId) => {
        try {
          const user = await callApi((rpc) => rpc["org.setActive"]({ organizationId }));
          setState({ status: "in", user });
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : "Couldn't switch organization.";
        }
      },
    }),
    [state, load],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

// The signed-in user; only inside screens the layout shows to signed-in users.
export function useUser(): SessionUser {
  const { state } = useSession();
  if (state.status !== "in") throw new Error("useUser needs a signed-in user");
  return state.user;
}
