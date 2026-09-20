import type { Metadata } from "next";
import { ALLOW_SIGNUP } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign in — next-mem0" };

export default function SignInPage() {
  return <AuthForm mode="sign-in" allowSignUp={ALLOW_SIGNUP} />;
}
