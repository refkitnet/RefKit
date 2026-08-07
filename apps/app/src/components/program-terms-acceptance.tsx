"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ProgramAgreementPanel } from "@/components/program-agreement-panel";

type ProgramTermsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  termsText: string | null | undefined;
};

export function ProgramTermsDialog({
  open,
  onOpenChange,
  termsText,
}: ProgramTermsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>App agreement and RefKit rules</DialogTitle>
          <DialogDescription>
            Review the App agreement and RefKit rules you must accept to join.
          </DialogDescription>
        </DialogHeader>
        <ProgramAgreementPanel
          termsText={termsText}
          ownerHeading="App agreement"
          className="text-sm"
        />
      </DialogContent>
    </Dialog>
  );
}

type ProgramTermsAcceptCheckboxProps = {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onOpenTerms: () => void;
  id?: string;
  disabled?: boolean;
};

export function ProgramTermsAcceptCheckbox({
  accepted,
  onAcceptedChange,
  onOpenTerms,
  id = "accepted-rules",
  disabled = false,
}: ProgramTermsAcceptCheckboxProps) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={accepted}
        disabled={disabled}
        onCheckedChange={(checked) => onAcceptedChange(checked === true)}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className="text-sm font-normal leading-5 text-muted-foreground"
      >
        I accept the current App agreement and RefKit{" "}
        <button
          type="button"
          className="underline hover:text-foreground"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenTerms();
          }}
        >
          rules
        </button>
        .
      </Label>
    </div>
  );
}

type ProgramTermsAcceptanceProps = {
  termsText: string | null | undefined;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  id?: string;
  disabled?: boolean;
};

export function ProgramTermsAcceptance({
  termsText,
  accepted,
  onAcceptedChange,
  id = "accepted-rules",
  disabled = false,
}: ProgramTermsAcceptanceProps) {
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <>
      <ProgramTermsAcceptCheckbox
        id={id}
        accepted={accepted}
        onAcceptedChange={onAcceptedChange}
        onOpenTerms={() => setTermsOpen(true)}
        disabled={disabled}
      />
      <ProgramTermsDialog
        open={termsOpen}
        onOpenChange={setTermsOpen}
        termsText={termsText}
      />
    </>
  );
}
