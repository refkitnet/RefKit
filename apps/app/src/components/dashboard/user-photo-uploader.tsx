"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Loader2, Upload } from "lucide-react";
import { UserDisplay } from "@/components/dashboard/user-display";
import {
  ACCEPT_ATTR,
  validateLogoFile,
} from "@/components/dashboard/app-logo-uploader";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import type { MeProfile } from "@/lib/dashboard-types";
import { cn } from "@/lib/utils";

type UserPhotoUploaderProps = {
  me: MeProfile;
  onUpdated: () => Promise<void> | void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

export function UserPhotoUploader({
  me,
  onUpdated,
  onMessage,
  onError,
}: UserPhotoUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const displayImageUrl = previewUrl ?? me.image;
  const hasPhoto = Boolean(me.image);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const clearInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, []);

  const setLocalPreview = useCallback((file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return objectUrl;
    });
  }, []);

  const clearLocalPreview = useCallback(() => {
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      const validationError = validateLogoFile(file);

      if (validationError) {
        onError(validationError.replaceAll("Logo", "Photo"));
        clearInput();
        return;
      }

      setLoading(true);
      setLocalPreview(file);

      try {
        const formData = new FormData();
        formData.append("file", file);
        await apiFetch<MeProfile>("/api/v1/me/photo", {
          method: "POST",
          body: formData,
        });
        onMessage("Profile photo saved.");
        await onUpdated();
        clearLocalPreview();
      }
      catch (err) {
        clearLocalPreview();
        onError(
          err instanceof Error ? err.message : "Failed to upload profile photo",
        );
      }
      finally {
        setLoading(false);
        clearInput();
      }
    },
    [clearInput, clearLocalPreview, onError, onMessage, onUpdated, setLocalPreview],
  );

  const onRemovePhoto = useCallback(async () => {
    setLoading(true);

    try {
      await apiFetch<MeProfile>("/api/v1/me/photo", { method: "DELETE" });
      clearLocalPreview();
      onMessage("Profile photo removed.");
      await onUpdated();
    }
    catch (err) {
      onError(
        err instanceof Error ? err.message : "Failed to remove profile photo",
      );
    }
    finally {
      setLoading(false);
      clearInput();
    }
  }, [clearInput, clearLocalPreview, onError, onMessage, onUpdated]);

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];

      if (file) {
        void uploadFile(file);
      }
    },
    [uploadFile],
  );

  const onDragEnter = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragOver(false);

      if (loading) {
        return;
      }

      const file = event.dataTransfer.files?.[0];

      if (file) {
        void uploadFile(file);
      }
    },
    [loading, uploadFile],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId}>Profile photo</Label>
        {hasPhoto ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            disabled={loading}
            onClick={() => void onRemovePhoto()}
          >
            {loading ? <Loader2 className="animate-spin" /> : null}
            Remove
          </Button>
        ) : null}
      </div>

      <label
        htmlFor={inputId}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-busy={loading}
        className={cn(
          "group relative flex cursor-pointer items-center gap-3 rounded-md border border-dashed bg-muted/20 p-3 transition-colors",
          dragOver
            ? "border-muted-foreground/40 bg-muted/40"
            : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
          loading && "pointer-events-none opacity-80",
        )}
      >
        <UserDisplay
          id={me.id}
          name={me.name}
          email={me.email}
          image={displayImageUrl}
          size="lg"
          showName={false}
          className="size-12"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {hasPhoto ? "Replace photo" : "Upload photo"}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG, JPEG, or WebP, max 1 MB.
          </p>
        </div>

        <span className="hidden text-muted-foreground transition-colors group-hover:text-foreground sm:flex">
          <Upload className="size-4" />
        </span>

        {loading && previewUrl ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/60">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </span>
        ) : null}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTR}
          disabled={loading}
          className="sr-only"
          onChange={onInputChange}
        />
      </label>
    </div>
  );
}
