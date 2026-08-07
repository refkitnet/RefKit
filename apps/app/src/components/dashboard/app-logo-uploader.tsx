"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Loader2, Upload } from "lucide-react";
import { AppIcon } from "@/components/dashboard/app-icon";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export const MAX_LOGO_SIZE_BYTES = 1024 * 1024;
export const ACCEPTED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export const ACCEPT_ATTR = "image/png,image/jpeg,image/webp";

export function validateLogoFile(file: File) {
  if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
    return "Logo must be a PNG, JPEG, or WebP image.";
  }

  if (file.size === 0 || file.size > MAX_LOGO_SIZE_BYTES) {
    return "Logo must be smaller than 1 MB.";
  }

  return null;
}

type AppLogoPickerProps = {
  appName: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  variant?: "default" | "compact";
};

export function AppLogoPicker({
  appName,
  file,
  onFileChange,
  onError,
  disabled = false,
  variant = "default",
}: AppLogoPickerProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const previewUrl = useMemo(() => {
    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
  }, [file]);

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

  const selectFile = useCallback(
    (nextFile: File) => {
      const validationError = validateLogoFile(nextFile);

      if (validationError) {
        onError?.(validationError);
        clearInput();
        return;
      }

      onFileChange(nextFile);
      clearInput();
    },
    [clearInput, onError, onFileChange],
  );

  const onInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextFile = event.target.files?.[0];

      if (nextFile) {
        selectFile(nextFile);
      }
    },
    [selectFile],
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

      if (disabled) {
        return;
      }

      const nextFile = event.dataTransfer.files?.[0];

      if (nextFile) {
        selectFile(nextFile);
      }
    },
    [disabled, selectFile],
  );

  const removeButton = file ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
      disabled={disabled}
      onClick={() => {
        onFileChange(null);
        clearInput();
      }}
    >
      Remove
    </Button>
  ) : null;

  if (variant === "compact") {
    return (
      <div className="flex w-16 shrink-0 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={inputId}>Logo</Label>
          {removeButton}
        </div>

        <label
          htmlFor={inputId}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          title="Upload logo (optional)"
          className={cn(
            "group relative flex size-16 cursor-pointer items-center justify-center rounded-lg border border-dashed bg-muted/20 transition-colors",
            dragOver
              ? "border-muted-foreground/40 bg-muted/40"
              : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
            disabled && "pointer-events-none opacity-80",
          )}
        >
          <AppIcon
            name={appName}
            logoUrl={previewUrl}
            className="size-16 text-xl"
          />

          <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-background/70 opacity-0 transition-opacity group-hover:opacity-100">
            <Upload className="size-4 text-muted-foreground" />
          </span>

          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT_ATTR}
            disabled={disabled}
            className="sr-only"
            onChange={onInputChange}
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={inputId}>App logo</Label>
          <p className="text-xs text-muted-foreground">Optional</p>
        </div>
        {removeButton}
      </div>

      <label
        htmlFor={inputId}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "group relative flex cursor-pointer items-center gap-4 rounded-lg border border-dashed bg-muted/20 p-4 transition-colors",
          dragOver
            ? "border-muted-foreground/40 bg-muted/40"
            : "border-border hover:border-muted-foreground/30 hover:bg-muted/40",
          disabled && "pointer-events-none opacity-80",
        )}
      >
        <AppIcon
          name={appName}
          logoUrl={previewUrl}
          className="size-16 text-xl"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {file ? "Replace logo" : "Upload logo"}
          </p>
          <p className="text-xs text-muted-foreground">
            Click or drag an image here. PNG, JPEG, or WebP up to 1 MB.
          </p>
        </div>

        <span className="hidden text-muted-foreground transition-colors group-hover:text-foreground sm:flex">
          <Upload className="size-5" />
        </span>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTR}
          disabled={disabled}
          className="sr-only"
          onChange={onInputChange}
        />
      </label>
    </div>
  );
}

type AppLogoUploaderProps = {
  appId: string;
  appName: string;
  logoUrl: string | null;
  onUpdated: () => Promise<void> | void;
  onMessage: (message: string) => void;
  onError: (message: string) => void;
};

export function AppLogoUploader({
  appId,
  appName,
  logoUrl,
  onUpdated,
  onMessage,
  onError,
}: AppLogoUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const displayLogoUrl = previewUrl ?? logoUrl;
  const hasLogo = Boolean(logoUrl);

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
        onError(validationError);
        clearInput();
        return;
      }

      setLoading(true);
      setLocalPreview(file);

      try {
        const formData = new FormData();
        formData.append("file", file);
        await apiFetch(`/api/v1/apps/${appId}/logo`, {
          method: "POST",
          body: formData,
        });
        onMessage("App logo saved.");
        await onUpdated();
        clearLocalPreview();
      }
      catch (err) {
        clearLocalPreview();
        onError(
          err instanceof Error ? err.message : "Failed to upload app logo",
        );
      }
      finally {
        setLoading(false);
        clearInput();
      }
    },
    [
      appId,
      clearInput,
      clearLocalPreview,
      onError,
      onMessage,
      onUpdated,
      setLocalPreview,
    ],
  );

  const onRemoveLogo = useCallback(async () => {
    setLoading(true);

    try {
      await apiFetch(`/api/v1/apps/${appId}/logo`, { method: "DELETE" });
      clearLocalPreview();
      onMessage("App logo removed.");
      await onUpdated();
    }
    catch (err) {
      onError(
        err instanceof Error ? err.message : "Failed to remove app logo",
      );
    }
    finally {
      setLoading(false);
      clearInput();
    }
  }, [appId, clearInput, clearLocalPreview, onError, onMessage, onUpdated]);

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
        <Label htmlFor={inputId}>App logo</Label>
        {hasLogo ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
            disabled={loading}
            onClick={() => void onRemoveLogo()}
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
        <AppIcon
          name={appName}
          logoUrl={displayLogoUrl}
          className="size-12 text-base"
        />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {hasLogo ? "Replace logo" : "Upload logo"}
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
