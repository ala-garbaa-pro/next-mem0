"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { addMessageAction } from "@/app/actions";
import { ROLES, type Role } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ROLE_LABEL: Record<Role, string> = { user: "User", assistant: "Assistant", system: "System" };

export function AddMessageForm({ conversationId }: { conversationId: string }) {
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>("user");
  const formRef = useRef<HTMLFormElement>(null);

  function submit(formData: FormData) {
    startTransition(async () => {
      const res = await addMessageAction(null, formData);
      if (res.ok) {
        formRef.current?.reset();
        // Alternate roles so pasting a back-and-forth is quick.
        setRole((r) => (r === "user" ? "assistant" : "user"));
        toast.success("Message saved");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <form ref={formRef} action={submit} className="space-y-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <Textarea
        name="content"
        required
        rows={4}
        placeholder="Paste or type a message…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
        }}
      />
      <div className="flex items-center gap-2">
        <Select name="role" value={role} onValueChange={(v) => setRole(v as Role)} items={ROLE_LABEL}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABEL[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Ctrl/⌘ + Enter to save</span>
        <Button type="submit" size="sm" disabled={pending} className="ml-auto">
          {pending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
          Save message
        </Button>
      </div>
    </form>
  );
}
