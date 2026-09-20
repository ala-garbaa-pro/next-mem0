"use client";

import { useState, useTransition } from "react";
import { Loader2Icon, PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteConversationAction, renameConversationAction } from "@/app/actions";
import type { Conversation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ConversationActions({ conversation }: { conversation: Conversation }) {
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const [tags, setTags] = useState(conversation.tags.join(", "));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await renameConversationAction(
        conversation.id,
        title,
        tags.split(",").map((t) => t.trim()).filter(Boolean),
      );
      if (res.ok) {
        toast.success("Saved");
        setEditOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      await deleteConversationAction(conversation.id);
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger render={<Button variant="outline" size="icon" aria-label="Edit" className="text-muted-foreground" />}>
          <PencilIcon />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit conversation</DialogTitle>
            <DialogDescription>Change the title and tags.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-tags">Tags</Label>
              <Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={save} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete"
              className="text-muted-foreground hover:border-destructive/45! hover:bg-destructive/15! hover:text-destructive"
            />
          }
        >
          <Trash2Icon />
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this conversation?</DialogTitle>
            <DialogDescription>
              “{conversation.title}” and its {conversation.messageCount} messages will be removed from the local
              database. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" data-icon="inline-start" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
