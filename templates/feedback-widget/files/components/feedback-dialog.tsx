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

  // TIER 2: screenshot state. Delete this block (through uploadScreenshot) if
  // you skip screenshot support, along with the Screenshot section in the JSX.
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setScreenshot(null);
      setScreenshotError(null);
    }
  }, [open, form.reset]);

  // Manage object-URL lifecycle for the preview thumbnail.
  useEffect(() => {
    if (!screenshot) {
      setScreenshotPreview(null);
      return;
    }
    const url = URL.createObjectURL(screenshot);
    setScreenshotPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const handleFile = useCallback((file: File) => {
    setScreenshotError(null);
    if (!ALLOWED_MIME_SET.has(file.type)) {
      setScreenshotError("Please attach a PNG, JPEG, WebP, or GIF image.");
      return;
    }
    if (file.size > FEEDBACK_SCREENSHOT_MAX_BYTES) {
      setScreenshotError(
        `Screenshot is too large (${formatBytes(file.size)}). Max ${formatBytes(FEEDBACK_SCREENSHOT_MAX_BYTES)}.`,
      );
      return;
    }
    setScreenshot(file);
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
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, handleFile]);

  function clearScreenshot() {
    setScreenshot(null);
    setScreenshotError(null);
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

  const messageValue = form.watch("message") ?? "";

  async function onSubmit(values: {
    category: FeedbackCategory;
    severity: FeedbackSeverity;
    message: string;
  }) {
    setSubmitting(true);
    setServerError(null);
    try {
      let screenshotKey: string | null = null;
      if (screenshot) {
        try {
          screenshotKey = await uploadScreenshot(screenshot);
        } catch (err) {
          setServerError(err instanceof Error ? err.message : "Failed to upload screenshot");
          return;
        }
      }

      const payload: FeedbackSubmission = {
        ...values,
        ...collectClientContext(),
        screenshotKey,
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
        hasScreenshot: !!screenshotKey,
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
            <Label>Screenshot (optional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_MIME_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {screenshot && screenshotPreview ? (
              <div className="flex items-start gap-3 rounded-md border p-3">
                <Image
                  src={screenshotPreview}
                  alt="Screenshot preview"
                  width={96}
                  height={64}
                  className="h-16 w-24 rounded border object-cover"
                  unoptimized
                />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{screenshot.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(screenshot.size)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={clearScreenshot}
                  aria-label="Remove screenshot"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  Attach screenshot
                </Button>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ImageIcon className="h-3 w-3" />
                  or paste an image (Ctrl+V)
                </span>
              </div>
            )}
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
