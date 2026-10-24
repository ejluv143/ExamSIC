import { useLocalSearchParams } from "expo-router";
import { TakeSession } from "@/taking/take-session";

export default function Take() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  return <TakeSession sessionId={sessionId} />;
}
