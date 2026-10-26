// Team Relay on the player's phone: the team lobby, the team's password board and guess form, retry, rescue and the
// debrief (the web's `relay-player.tsx`).
import type { RelayMember, RelayMyTeam, RelayPiece, RelayView } from "@examinus/contract/game";
import { useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Field } from "@/ui/components";
import { AvatarImage } from "./avatar";
import { claimRescue, confirmPassword, pickTeam, rejectPassword, retryQuestion, submitPassword } from "./actions";
import { Debrief, RoundClock } from "./parts";

// Runs a call and keeps its refusal text for display.
function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (call: () => Promise<string | null>) => {
    setPending(true);
    const refusal = await call();
    setError(refusal);
    setPending(false);
    return refusal === null;
  };
  return { pending, error, run };
}

const nameOf = (members: readonly RelayMember[], who: string) => members.find((m) => m.attemptId === who)?.name ?? who;

function ErrorText({ children }: { children: string | null }) {
  return children === null ? null : (
    <Text accessibilityRole="alert" className="text-sm text-danger">
      {children}
    </Text>
  );
}

// The lobby: every team with its members and free places. With picking on, a Join button on each team that has room.
export function RelayPlayerLobby({ relay, sessionId }: { relay: RelayView; sessionId: string }) {
  const { pending, error, run } = useAction();
  return (
    <View className="w-full gap-3" accessibilityLabel="Teams">
      <Text className="text-center text-base text-muted">
        {relay.studentPick ? `Pick a team (up to ${relay.teamSize} players each).` : "Your teacher will assign teams."}
      </Text>
      {relay.teams.map((team) => {
        const free = Math.max(relay.teamSize - team.members.length, 0);
        const own = team.id === relay.myTeamId;
        return (
          <View key={team.id} className={`rounded-xl border bg-surface p-3 ${own ? "border-primary" : "border-border"}`} style={own ? { borderWidth: 2 } : undefined}>
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 font-semibold text-foreground" numberOfLines={1}>
                {team.name}
                {own && <Text className="text-sm font-medium text-primary">{"  (your team)"}</Text>}
              </Text>
              <Text className="text-sm text-muted">{free === 0 ? "Full" : `${free} ${free === 1 ? "place" : "places"} free`}</Text>
            </View>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {team.members.map((m) => (
                <View key={m.attemptId} className="flex-row items-center gap-1.5 rounded-full bg-surface-muted py-0.5 pl-0.5 pr-3">
                  <AvatarImage avatar={m.avatar} size={24} />
                  <Text className="text-sm text-foreground">{m.name}</Text>
                </View>
              ))}
              {team.members.length === 0 && <Text className="text-sm text-muted">Nobody yet</Text>}
            </View>
            {relay.studentPick && !own && free > 0 && (
              <View className="mt-3">
                <Button variant="secondary" disabled={pending} onPress={() => void run(() => pickTeam(sessionId, team.id))}>
                  {`Join ${team.name}`}
                </Button>
              </View>
            )}
          </View>
        );
      })}
      {relay.unassigned.length > 0 && <Text className="text-sm text-muted">Not in a team yet: {relay.unassigned.map((m) => m.name).join(", ")}</Text>}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const slotWords: Record<RelayPiece["state"], string> = {
  unlocked: "",
  open: "waiting",
  retry: "retry",
  rescue: "rescue",
  rescuing: "rescuing",
  locked: "locked",
};

// The password so far: one box per question slot, each saying its state in a word.
function Board({ team, kind }: { team: RelayMyTeam; kind: RelayView["pieceKind"] }) {
  const wide = kind === "word" || kind === "clue";
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityLabel="Password pieces">
      {team.board.map((piece, i) => {
        const open = piece.state === "unlocked" && piece.text !== null;
        return (
          <View
            key={i}
            className={`min-h-14 items-center justify-center rounded-lg border-2 px-2 py-1 ${wide ? "min-w-24" : "min-w-12"} ${
              open ? "border-emerald-500 bg-emerald-50" : "border-dashed border-border bg-surface-muted"
            }`}
          >
            {open ? (
              <>
                {kind === "coordinate" && piece.position !== null && <Text className="text-[10px] text-emerald-900">{piece.position}</Text>}
                <Text className={`font-bold text-emerald-900 ${wide ? "text-sm" : "text-xl uppercase"}`}>✓ {piece.text}</Text>
              </>
            ) : (
              <>
                <Text className="text-muted">🔒</Text>
                <Text className="text-[10px] uppercase text-muted">{slotWords[piece.state]}</Text>
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

// The team's panel during the game: round clock, the board, the password form (or the proposal waiting for
// confirmation), the retry button, and once the round is over the password.
export function RelayTeamPanel({
  relay,
  sessionId,
  meAttemptId,
  meName,
  roundMs,
  retryButton = true,
}: {
  relay: RelayView;
  sessionId: string;
  meAttemptId: string;
  meName: string;
  roundMs: number | null;
  retryButton?: boolean;
}) {
  const team = relay.team;
  const { pending, error, run } = useAction();
  const [guess, setGuess] = useState("");
  if (!team) return null;
  const unlocked = team.board.filter((p) => p.state === "unlocked").length;
  const proposal = team.proposal;
  const confirmedByMe = proposal ? proposal.confirmed.some((c) => c === meAttemptId || c === meName) : false;
  const last = team.lastGuess;

  async function submit() {
    const value = guess.trim();
    if (!value) return;
    if (await run(() => submitPassword(sessionId, value))) setGuess("");
  }

  return (
    <Card className="gap-3 p-4">
      <View className="gap-1">
        <Text className="text-lg font-semibold text-foreground">Team {team.name}</Text>
        <Text className="text-sm text-muted">
          {unlocked} of {team.board.length} pieces unlocked
        </Text>
        <RoundClock ms={roundMs} />
      </View>
      <Text className="text-sm text-muted">With {team.members.filter((m) => m.attemptId !== meAttemptId).map((m) => m.name).join(", ") || "nobody else"}</Text>
      <Board team={team} kind={relay.pieceKind} />

      {team.finished ? (
        <Text className="font-medium text-foreground">
          {team.solved ? "Your team solved the password!" : "Your team's round is over."}
          {team.password ? ` The password was ${team.password}.` : ""}
        </Text>
      ) : (
        <View className="gap-2">
          <Text className="text-sm text-foreground">
            Guesses left: <Text className="font-semibold">{team.guessesLeft}</Text>
          </Text>
          {proposal ? (
            <View className="gap-1 rounded-lg border border-border bg-surface-muted p-3">
              <Text className="text-sm text-foreground">
                {nameOf(team.members, proposal.by)} proposes <Text className="font-bold">{proposal.guess}</Text>
              </Text>
              <Text className="text-sm text-muted">
                Confirmed by {proposal.confirmed.length} of {proposal.needed}
                {proposal.confirmed.length > 0 && `: ${proposal.confirmed.map((c) => nameOf(team.members, c)).join(", ")}`}
              </Text>
              <View className="mt-2 gap-2">
                <Button disabled={pending || confirmedByMe} onPress={() => void run(() => confirmPassword(sessionId))}>
                  {confirmedByMe ? "You confirmed" : "Confirm"}
                </Button>
                <Button variant="secondary" disabled={pending} onPress={() => void run(() => rejectPassword(sessionId))}>
                  Reject
                </Button>
              </View>
            </View>
          ) : (
            <View className="gap-2">
              <Field
                label={relay.requireConsensus ? "Propose the team password" : "Team password guess"}
                value={guess}
                onChangeText={setGuess}
                maxLength={200}
                autoCorrect={false}
                placeholder="Team password"
                onSubmitEditing={() => void submit()}
              />
              <Button disabled={pending || guess.trim() === ""} onPress={() => void submit()}>
                {relay.requireConsensus ? "Propose" : "Submit"}
              </Button>
            </View>
          )}
        </View>
      )}

      {last && !last.correct && !team.finished && (
        <Text className="text-sm text-danger">
          {nameOf(team.members, last.by)} guessed “{last.guess}”: not the password.
        </Text>
      )}
      <ErrorText>{error}</ErrorText>
      {retryButton && <RetryButton team={team} sessionId={sessionId} />}
    </Card>
  );
}

// After a wrong answer: answer the same question again for fewer points.
export function RetryButton({ team, sessionId }: { team: RelayMyTeam; sessionId: string }) {
  const { pending, error, run } = useAction();
  if (!team.retry) return null;
  return (
    <View className="gap-1">
      <Button variant="secondary" disabled={pending} onPress={() => void run(() => retryQuestion(sessionId))}>
        {`Try again (${team.retry.percent}% of the points, ${team.retry.left} ${team.retry.left === 1 ? "try" : "tries"} left)`}
      </Button>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

// Teammates' locked questions a finished player may answer for part of the points.
export function RescueList({ team, sessionId }: { team: RelayMyTeam; sessionId: string }) {
  const { pending, error, run } = useAction();
  if (team.finished || team.rescuable.length === 0) return null;
  return (
    <View className="w-full gap-2" accessibilityLabel="Rescue a teammate">
      <Text className="text-lg font-semibold text-foreground">Rescue a teammate</Text>
      <Text className="text-sm text-muted">You finished your questions. Answer one of these once, for part of the points, to unlock its piece.</Text>
      {team.rescuable.map((r) => (
        <View key={r.questionId} className="gap-2 rounded-lg border border-border bg-surface p-3">
          <Text className="text-xs text-muted">{r.owner ? `${r.owner}'s question` : "Question without an owner"}</Text>
          <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
            {r.prompt}
          </Text>
          <Button disabled={pending} onPress={() => void run(() => claimRescue(sessionId, r.questionId))}>
            Rescue
          </Button>
        </View>
      ))}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

// The team's questions after its round.
export function TeamDebrief({ team }: { team: RelayMyTeam }) {
  if (!team.debrief) return null;
  return (
    <View className="w-full gap-3" accessibilityLabel="Team debrief">
      <Text className="text-xl font-semibold text-foreground">Debrief</Text>
      <Debrief items={team.debrief} />
    </View>
  );
}
