// The phone's wiring of the live WebSocket client (packages/client): tickets come from the API's `live.ticket` with the
// bearer token, and a backoff ends early when the network comes back or the app returns to the foreground.
import { makeLiveClient, type Issued } from "@examinus/client/live";
import { liveRpcPath, type TicketTarget } from "@examinus/contract/live";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";
import { callResult } from "@/lib/api";
import { API_URL } from "@/lib/env";
import { Result } from "effect";

// The live WebSocket's address: the API's origin with the WebSocket scheme.
const liveUrl = () => {
  const url = new URL(liveRpcPath, API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
};

// A ticket, a refusal ({ error }), or null when it's worth asking again (offline, the server failed).
async function requestTicket(target: TicketTarget): Promise<Issued | null> {
  try {
    const result = await callResult((api) => api["live.ticket"]({ target }));
    if (Result.isSuccess(result)) return { ok: { ticket: result.success.ticket, url: liveUrl() } };
    const { _tag, message } = result.failure;
    return { error: _tag === "Unauthorized" ? "Sign in again to follow this session." : (message ?? "You can't follow this session.") };
  } catch {
    return null;
  }
}

export const { followTeacher, followStudent, followLobby, followGame } = makeLiveClient({
  requestTicket,
  wake: (signal) => {
    const appState = AppState.addEventListener("change", (state) => state === "active" && signal());
    let wasConnected: boolean | null = null;
    const network = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;
      if (connected && wasConnected === false) signal();
      wasConnected = connected;
    });
    return () => {
      appState.remove();
      network();
    };
  },
});
