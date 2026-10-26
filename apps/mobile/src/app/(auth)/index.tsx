import { Redirect } from "expo-router";

// Signing out lands on the group itself: send it to the sign-in screen.
export default function AuthIndex() {
  return <Redirect href="/sign-in" />;
}
