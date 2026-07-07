"use client";
// Destination: src/components/feedback/feedback-dialog.tsx
// The feedback form. Depends on shadcn/ui (button, dialog, label, select,
// textarea), sonner, react-hook-form + zod resolver, lucide-react.
// TIER 2 (screenshot) and TIER 3 (diagnostics) touchpoints are marked.

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Paperclip, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { track } from "@/lib/feedback/analytics-client";
// TIER 3: delete this import (and the `diagnostics` payload line) if you skip telemetry.
import { collectFeedbackDiagnostics } from "@/lib/feedback/telemetry-client";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SCREENSHOT_MAX_BYTES,
  FEEDBACK_SCREENSHOT_MAX_COUNT,
  type FeedbackCategory,
  type FeedbackScreenshotMimeType,
  type FeedbackSeverity,
  type FeedbackSubmission,
  feedbackCategories,
  feedbackScreenshotMimeTypes,
  feedbackSeverities,
  feedbackSubmissionSchema,
} from "@/lib/validations/feedback";

const SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const ALLOWED_MIME_SET = new Set<string>(feedbackScreenshotMimeTypes);
const ALLOWED_MIME_ACCEPT = feedbackScreenshotMimeTypes.join(",");

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modalTitle?: string | null;
}

function collectClientContext() {
  return {
    pageUrl: window.location.href,
    pagePath: window.location.pathname,
    referrer: document.referrer || null,
    userAgent: navigator.userAgent,
    viewport: {
      w: window.innerWidth,
      h: window.innerHeight,
      dpr: window.devicePixelRatio,
    },
    screen: { w: window.screen.width, h: window.screen.height },
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const MESSAGE_MAX = 2000;

export function FeedbackDialog({ open, onOpenChange, modalTitle }: FeedbackDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // TIER 2: screenshot state. Delete this block (through uploadScreenshots) if
  // you skip screenshot support, along with the Screenshot section in the JSX.
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mirrors `screenshots` so addFiles can validate against the live count
  // synchronously without a stale closure, even across rapid successive calls
  // (a multi-file picker selection and a paste can both fire in one tick).
  const screenshotsRef = useRef<File[]>([]);

  const form = useForm<{
    category: FeedbackCategory;
    severity: FeedbackSeverity;
    message: string;
  }>({
    resolver: zodResolver(
      feedbackSubmissionSchema.pick({
        category: true,
        severity: true,
        message: true,
      }),
    ),
    defaultValues: {
      category: "bug",
      severity: "medium",
      message: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ category: "bug", severity: "medium", message: "" });
      setServerError(null);
      setScreenshots([]);
      setScreenshotError(null);
    }
  }, [open, form.reset]);

  // Keep the ref in lockstep with the state array.
  useEffect(() => {
    screenshotsRef.current = screenshots;
  }, [screenshots]);

  // Manage object-URL lifecycle for the preview thumbnails.
  useEffect(() => {
    if (screenshots.length === 0) {
      setScreenshotPreviews([]);
      return;
    }
    const urls = screenshots.map((file) => URL.createObjectURL(file));
    setScreenshotPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [screenshots]);

  // Validate and add a batch of files in one pass. Pure: computes the next
  // array and a single error message up front, then commits both. Reads the
  // live count from the ref so a batch that overflows the cap is truncated
  // correctly rather than each call racing on stale state.
  const addFiles = useCallback((incoming: File[]) => {
    const current = screenshotsRef.current;
    const accepted: File[] = [];
    let rejection: string | null = null;
    for (const file of incoming) {
      if (current.length + accepted.length >= FEEDBACK_SCREENSHOT_MAX_COUNT) {
        rejection = `You can attach up to ${FEEDBACK_SCREENSHOT_MAX_COUNT} screenshots.`;
        break;
      }
      if (!ALLOWED_MIME_SET.has(file.type)) {
        rejection = "Please attach a PNG, JPEG, WebP, or GIF image.";
        continue;
      }
      if (file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
        rejection = `Screenshot is too large (${formatBytes(file.size)}). Max ${formatBytes(FEEDBACK_SCREENSHOT_MAX_BYTES)}.`;
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) {
      const next = [...current, ...accepted];
      screenshotsRef.current = next;
      setScreenshots(next);
    }
    setScreenshotError(rejection);
  }, []);

  // Allow paste-from-clipboard while the dialog is open.
  useEffect(() => {
    if (!open) return;
    function onPaste(e: ClipboardEvent) {
      // Ignore when the user is typing into the textarea — they probably mean to paste text.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT") &&
        // Allow paste-image when the input is empty (common case for screenshots from snipping tool)
        (target as HTMLInputElement | HTMLTextAreaElement).value !== ""
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      const pastedFiles: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) pastedFiles.push(file);
        }
      }
      if (pastedFiles.length > 0) {
        e.preventDefault();
        addFiles(pastedFiles);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, addFiles]);

  function removeScreenshot(index: number) {
    setScreenshotError(null);
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function uploadScreenshot(file: File): Promise<string> {
    const presignRes = await fetch("/api/feedback/screenshot/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: file.type as FeedbackScreenshotMimeType,
        fileSize: file.size,
      }),
    });
    if (!presignRes.ok) {
      const json = (await presignRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(json?.error ?? "Failed to prepare screenshot upload");
    }
    const { data } = (await presignRes.json()) as {
      data: { presignedUrl: string; key: string };
    };
    const putRes = await fetch(data.presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Screenshot upload failed (${putRes.status})`);
    }
    return data.key;
  }

  // Each screenshot is an independent presign + PUT, so upload in parallel.
  async function uploadScreenshots(files: File[]): Promise<string[]> {
    return Promise.all(files.map((file) => uploadScreenshot(file)));
  }

  const messageValue = form.watch("message") ?? "";

  async function onSubmit(values: {
    category: FeedbackCategory;
    severity: FeedbackSeverity;
    message: string;
  }) {
    setSubmitting(true);
    setServerError(null);
    try {
      let screenshotKeys: string[] = [];
      if (screenshots.length > 0) {
        try {
          screenshotKeys = await uploadScreenshots(screenshots);
        } catch (err) {
          setServerError(err instanceof Error ? err.message : "Failed to upload screenshot");
          return;
        }
      }

      const payload: FeedbackSubmission = {
        ...values,
        ...collectClientContext(),
        screenshotKeys,
        modalTitle: modalTitle ?? null,
        // TIER 3: replace with `diagnostics: null` if you skip telemetry.
        diagnostics: collectFeedbackDiagnostics(),
      };
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        setServerError(
          `Please wait ${retryAfter ?? "a few"} seconds before sending more feedback.`,
        );
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? "Failed to send feedback");
      }
      track("feedback_submitted_client", {
        category: values.category,
        severity: values.severity,
        hasScreenshot: screenshotKeys.length > 0,
        screenshotCount: screenshotKeys.length,
        surface: modalTitle ? "modal" : "page",
      });
      toast.success("Thanks — feedback sent");
      onOpenChange(false);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `showFeedbackButton` only exists if you apply the optional dialog.tsx
          patch (in-modal feedback button). Remove the prop otherwise. */}
      <DialogContent className="sm:max-w-lg" showFeedbackButton={false}>
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          {modalTitle && (
            <p className="text-xs text-muted-foreground">
              From: <span className="font-medium text-foreground">{modalTitle}</span>
            </p>
          )}
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.watch("category")}
                onValueChange={(v) => v && form.setValue("category", v as FeedbackCategory)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {feedbackCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {FEEDBACK_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select
                value={form.watch("severity")}
                onValueChange={(v) => v && form.setValue("severity", v as FeedbackSeverity)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select severity" />
                </SelectTrigger>
                <SelectContent>
                  {feedbackSeverities.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SEVERITY_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="feedback-message">Message</Label>
              <span className="text-xs text-muted-foreground">
                {messageValue.length}/{MESSAGE_MAX}
              </span>
            </div>
            <Textarea
              id="feedback-message"
              rows={5}
              maxLength={MESSAGE_MAX}
              placeholder="What happened, what did you expect, and where in the app were you?"
              {...form.register("message")}
            />
            {form.formState.errors.message && (
              <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
            )}
          </div>

          {/* TIER 2: Screenshot section — delete if you skip screenshot support. */}
          <div className="space-y-2">
            <Label>Screenshots (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_MIME_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                addFiles(files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            {screenshots.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {screenshots.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="relative rounded-md border p-2"
                  >
                    {screenshotPreviews[index] && (
                      <Image
                        src={screenshotPreviews[index]}
                        alt={`Screenshot preview ${index + 1}`}
                        width={96}
                        height={64}
                        className="h-16 w-full rounded border object-cover"
                        unoptimized
                      />
                    )}
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-background shadow"
                      onClick={() => removeScreenshot(index)}
                      aria-label={`Remove screenshot ${index + 1}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={screenshots.length >= FEEDBACK_SCREENSHOT_MAX_COUNT}
              >
                <Paperclip className="mr-2 h-4 w-4" />
                {screenshots.length > 0 ? "Add another" : "Attach screenshot"}
              </Button>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ImageIcon className="h-3 w-3" />
                or paste an image (Ctrl+V) · up to {FEEDBACK_SCREENSHOT_MAX_COUNT}
              </span>
            </div>
            {screenshotError && <p className="text-sm text-destructive">{screenshotError}</p>}
          </div>

          {serverError && <p className="text-sm text-destructive">{serverError}</p>}

          <p className="text-xs text-muted-foreground">
            We'll automatically include the page you're on, your browser, and your account so we can
            investigate.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || messageValue.trim().length < 10}>
              {submitting ? "Sending..." : "Send feedback"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
