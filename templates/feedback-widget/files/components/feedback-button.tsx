"use client";
// Destination: src/components/feedback/feedback-button.tsx
// Page-level entry point: mount in your app shell / header, next to nav actions.

import { MessageSquareIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeedbackUser } from "./feedback-auth";
import { FeedbackDialog } from "./feedback-dialog";

export function FeedbackButton() {
  const user = useFeedbackUser();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  return (
    <>
      <Button
        variant="default"
        size="lg"
        aria-label="Send feedback"
        title="Send feedback"
        onClick={() => setOpen(true)}
        className="shadow-sm"
      >
        <MessageSquareIcon className="size-4" />
        <span className="hidden sm:inline">Feedback</span>
      </Button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
