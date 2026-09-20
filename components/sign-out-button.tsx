"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="ml-auto size-6 shrink-0"
      aria-label="Sign out"
      title="Sign out"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : <LogOutIcon className="size-3.5" />}
    </Button>
  );
}
