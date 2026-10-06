// Account lookups. Reads mock users for now; becomes calls to the API's auth endpoints later.
import { users } from "./mock";

export type User = { id: string; role: "teacher"; name: string; email: string; department: string };

// Everything except the password.
const publicUser = (u: (typeof users)[number]): User => ({
  id: u.id,
  role: u.role,
  name: u.name,
  email: u.email,
  department: u.department,
});

export async function getUser(id: string): Promise<User | null> {
  const user = users.find((u) => u.id === id);
  return user ? publicUser(user) : null;
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  // TODO: the API checks a password hash; the mock compares the demo password directly.
  return user && user.password === password ? publicUser(user) : null;
}

// Stand-in for "Sign in with Google" until the API does the real OAuth flow.
export async function demoGoogleUser(): Promise<User> {
  return publicUser(users[0]);
}
