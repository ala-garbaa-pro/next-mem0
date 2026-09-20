import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import { ready } from "@/lib/drizzle";

const handler = toNextJsHandler(auth);

// Make sure the schema exists before Better Auth touches its tables (first run).
export async function GET(request: Request) {
  await ready();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await ready();
  return handler.POST(request);
}
