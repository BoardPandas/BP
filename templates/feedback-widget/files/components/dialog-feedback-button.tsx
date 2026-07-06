"use client";
// Destination: src/components/feedback/dialog-feedback-button.tsx
// Optional in-modal entry point. Rendered inside every DialogContent (see the
// dialog.tsx patch in HANDOFF.md) so users can report issues about the modal
// they're currently in. Reads the parent dialog's title so the resulting
// GitHub issue says which modal the report came from.

import { MessageSquareIcon } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeedbackUser } from "./feedback-auth";
import { FeedbackDialog } from "./feedback-dialog";

// Relies on shadcn/ui's data-slot attributes on DialogContent/DialogTitle.
// ADAPT if your dialog primitives use different markers.
function readModalTitle(target: HTMLElement): string | null {
  const popup = target.closest('[data-slot="dialog-content"]');
  if (!popup) return null;
  const titleEl = popup.querySelector('[data-slot="dialog-title"]');
  const text = titleEl?.textContent?.trim();
  return text && text.length > 0 ? text : null;
}

export function DialogFeedbackButton() {
  const user = useFeedbackUser();
  const [open, setOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState<string | null>(null);

  if (!user) return null;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    setModalTitle(readModalTitle(event.currentTarget));
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="default"
        size="icon-sm"
        aria-label="Send feedback"
        title="Send feedback"
        onClick={handleClick}
        className="absolute bottom-2 left-2 shadow-sm"
      >
        <MessageSquareIcon />
      </Button>
      <FeedbackDialog open={open} onOpenChange={setOpen} modalTitle={modalTitle} />
    </>
  );
}
