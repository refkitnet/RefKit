import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

type AuthCheckEmailProps = {
  email: string;
  description: string;
  onUseDifferentEmail?: () => void;
  footer?: React.ReactNode;
};

export function AuthCheckEmail({
  email,
  description,
  onUseDifferentEmail,
  footer,
}: AuthCheckEmailProps) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-10 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Mail className="size-6" aria-hidden />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
          <p className="break-all text-sm font-medium text-foreground">{email}</p>
        </div>
        <p className="max-w-xs text-xs text-muted-foreground">
          Didn&apos;t get it? Check spam or promotions. The link expires after a
          short time.
        </p>
        {onUseDifferentEmail ? (
          <Button type="button" variant="outline" onClick={onUseDifferentEmail}>
            Use a different email
          </Button>
        ) : null}
        {footer}
      </CardContent>
    </Card>
  );
}
