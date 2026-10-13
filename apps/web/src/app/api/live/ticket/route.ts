import { TicketTarget } from "@examinus/contract/live";
import { Schema } from "effect";
import { readCurrentUser } from "@/lib/auth/dal";
import { getLiveTicket } from "@/lib/data/live";

const decodeTarget = Schema.decodeUnknownOption(Schema.Struct({ target: TicketTarget }));

// A ticket for the live WebSocket (see getLiveTicket). A route rather than a server action: the browser runs server
// actions one at a time, so a reconnect would otherwise wait behind every answer save, heartbeat and teacher action.
export async function POST(request: Request) {
  const body = decodeTarget(await request.json().catch(() => null));
  if (body._tag === "None") return Response.json({ error: "Bad request." }, { status: 400 });
  if (!(await readCurrentUser())) return Response.json({ error: "Sign in again to follow this session." }, { status: 401 });
  const issued = await getLiveTicket(body.value.target);
  return Response.json(issued, { headers: { "Cache-Control": "no-store" } });
}
