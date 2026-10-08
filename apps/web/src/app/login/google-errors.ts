// What went wrong with Google, from the `error` code Better Auth adds to the error URL.
export function googleSignInError(code: string | string[] | undefined) {
  if (code === "signup_disabled") return "No Examora account uses that Google email yet. Create an account first.";
  if (code === "BANNED_USER") return "That account is suspended, so it can't sign in.";
  return "Google sign-in didn't work. Try again, or sign in with your email and password.";
}
