"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2Icon } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isSignUp = mode === "sign-up";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const res = isSignUp
      ? await signUp.email({ email, password, name: name || email.split("@")[0] })
      : await signIn.email({ email, password });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Something went wrong");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="glass relative w-full max-w-sm overflow-hidden rounded-2xl p-6">
      <span className="absolute inset-x-0 top-0 h-0.5 [background:linear-gradient(90deg,var(--vivid-a),var(--vivid-b),transparent)]" />
      <h1 className="font-heading text-[21px] leading-7 font-bold tracking-[-0.02em]">
        {isSignUp ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isSignUp ? "Your conversations are stored under this account." : "Welcome back to your AI memory."}
      </p>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        {isSignUp && (
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" placeholder="Optional" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={8}
            required
          />
          {isSignUp && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Button type="submit" size="lg" disabled={pending} className="mt-1">
          {pending && <Loader2Icon data-icon="inline-start" className="animate-spin" />}
          {isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        {isSignUp ? (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="font-semibold text-vivid-a hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            First time here?{" "}
            <Link href="/sign-up" className="font-semibold text-vivid-a hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
