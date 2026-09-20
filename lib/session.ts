import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { ready } from "./drizzle";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Current user from the request cookies, or null. Waits for the database to be migrated first. */
export async function getSessionUser(): Promise<SessionUser | null> {
  await ready();
  const session = await auth.api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}

/** Same as getSessionUser() for API route handlers, which already hold the Request. */
export async function getRequestUser(request: Request): Promise<SessionUser | null> {
  await ready();
  const session = await auth.api.getSession({ headers: request.headers });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}

/** For pages and server actions: redirects to /sign-in when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
