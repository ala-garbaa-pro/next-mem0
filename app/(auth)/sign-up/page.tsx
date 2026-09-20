import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ALLOW_SIGNUP } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Create account — next-mem0" };

export default function SignUpPage() {
  // The API refuses sign-ups too (disableSignUp); this just keeps the form out of sight.
  if (!ALLOW_SIGNUP) redirect("/sign-in");
  return <AuthForm mode="sign-up" />;
}
