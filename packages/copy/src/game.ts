// What a game tells a player about where they stand.
type Standing = { rank: number; points: number };

// "You finished #2 with 1,200 points" once the game is over, "You're #2 with 1,200 points" while it runs, or
// "Team Owls finished #1 with 3,400 points" for a team.
export function rankSentence({ rank, points }: Standing, when: "final" | "now" | { team: string }): string {
  const score = `#${rank} with ${points.toLocaleString("en-PH")} points`;
  if (when === "now") return `You're ${score}`;
  if (when === "final") return `You finished ${score}`;
  return `Team ${when.team} finished ${score}`;
}
