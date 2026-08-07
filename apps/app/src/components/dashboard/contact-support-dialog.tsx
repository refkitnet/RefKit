"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Bug, ImagePlus, LifeBuoy, Lightbulb, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCEPT_ATTR,
  validateLogoFile,
} from "@/components/dashboard/app-logo-uploader";
import { apiFetch } from "@/lib/api-client";
import {
  DEFAULT_SUPPORT_REQUEST_TYPE,
  SUPPORT_REQUEST_TYPES,
  type SupportRequestType,
} from "@/lib/support-request";
import { cn } from "@/lib/utils";

const SUPPORT_REQUEST_ICONS = {
  support_inquiry: LifeBuoy,
  bug_report: Bug,
  feature_request: Lightbulb,
} as const;

type ContactSupportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string | null;
};

export function ContactSupportDialog({
  open,
  onOpenChange,
  email,
}: ContactSupportDialogProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [requestType, setRequestType] = useState<SupportRequestType>(
    DEFAULT_SUPPORT_REQUEST_TYPE
  );
  const [message, setMessage] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const previewUrl = useMemo(() => {
    if (!attachment) {
      return null;
    }

    return URL.createObjectURL(attachment);
  }, [attachment]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function resetForm() {
    setRequestType(DEFAULT_SUPPORT_REQUEST_TYPE);
    setMessage("");
    setAttachment(null);
    setLoading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }

    onOpenChange(nextOpen);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email) {
      toast.error("Your account needs an email address before contacting support.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.set("type", requestType);
      formData.set("message", message.trim());

      if (attachment) {
        formData.set("file", attachment);
      }

      await apiFetch<{ ok: true }>("/api/v1/support", {
        method: "POST",
        body: formData,
      });

      toast.success("Support request sent.");
      handleOpenChange(false);
    }
    catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not send support request."
      );
    }
    finally {
      setLoading(false);
    }
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      setAttachment(null);
      return;
    }

    const validationError = validateLogoFile(nextFile);

    if (validationError) {
      toast.error(validationError);
      event.target.value = "";
      setAttachment(null);
      return;
    }

    setAttachment(nextFile);
  }

  function clearAttachment() {
    setAttachment(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Contact support</DialogTitle>
          <DialogDescription>
            {email
              ? `Tell us what you need help with. We will reply to ${email}.`
              : "Tell us what you need help with. Add an email to your account so we can reply."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="support-type">Topic</FieldLabel>
              <Select
                value={requestType}
                onValueChange={(value) =>
                  setRequestType(value as SupportRequestType)
                }
                disabled={loading}
              >
                <SelectTrigger id="support-type" className="w-full">
                  <SelectValue placeholder="Select a topic" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_REQUEST_TYPES.map((option) => {
                    const Icon = SUPPORT_REQUEST_ICONS[option.value];

                    return (
                      <SelectItem key={option.value} value={option.value}>
                        <Icon />
                        {option.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="support-message">Message</FieldLabel>
              <Textarea
                id="support-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Describe the issue or question."
                rows={5}
                required
                disabled={loading}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={fileInputId}>Screenshot (optional)</FieldLabel>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept={ACCEPT_ATTR}
                className="sr-only"
                onChange={onFileChange}
                disabled={loading}
              />
              {attachment && previewUrl ? (
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Attachment preview"
                    className="size-16 rounded-md border border-border object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{attachment.name}</p>
                    <p className="text-xs text-muted-foreground">
                      PNG, JPEG, or WebP up to 1 MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={clearAttachment}
                    disabled={loading}
                    aria-label="Remove attachment"
                  >
                    <X />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className={cn("w-full justify-start gap-2")}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  <ImagePlus className="size-4" />
                  Add image
                </Button>
              )}
            </Field>
          </FieldGroup>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={loading || !message.trim() || !email}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Sending
                </>
              ) : (
                "Send"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
