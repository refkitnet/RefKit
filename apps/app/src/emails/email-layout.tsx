import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import {
  emailColors,
  emailFontFamily,
  emailStyles,
} from "@/emails/email-theme";
import { getServerEnv } from "@/lib/env";

type RefKitEmailProps = {
  preview: string;
  children: ReactNode;
};

export function RefKitEmail({ preview, children }: RefKitEmailProps) {
  const instanceHost = new URL(getServerEnv().APP_URL).host;

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.outerContainer}>
          <Container style={emailStyles.card}>
            <Section style={emailStyles.brandRow}>
              <Text style={emailStyles.brandName}>RefKit</Text>
            </Section>
            <Hr style={emailStyles.divider} />
            {children}
          </Container>
          <Text style={emailStyles.siteFooter}>{instanceHost}</Text>
        </Container>
      </Body>
    </Html>
  );
}

type EmailHeadingProps = {
  children: ReactNode;
};

export function EmailHeading({ children }: EmailHeadingProps) {
  return <Text style={emailStyles.heading}>{children}</Text>;
}

type EmailTextProps = {
  children: ReactNode;
  mono?: boolean;
};

export function EmailText({ children, mono = false }: EmailTextProps) {
  return (
    <Text style={mono ? emailStyles.mono : emailStyles.text}>{children}</Text>
  );
}

type EmailMutedProps = {
  children: ReactNode;
};

export function EmailMuted({ children }: EmailMutedProps) {
  return <Text style={emailStyles.muted}>{children}</Text>;
}

type EmailButtonProps = {
  href: string;
  children: ReactNode;
};

export function EmailButton({ href, children }: EmailButtonProps) {
  return (
    <Button href={href} style={emailStyles.button}>
      {children}
    </Button>
  );
}

type EmailCalloutProps = {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success";
};

export function EmailCallout({
  children,
  tone = "neutral",
}: EmailCalloutProps) {
  const toneStyle =
    tone === "warning"
      ? emailStyles.calloutWarning
      : tone === "success"
        ? emailStyles.calloutSuccess
        : {};

  return (
    <Section style={{ ...emailStyles.callout, ...toneStyle }}>
      <Text
        style={{
          ...emailStyles.text,
          margin: 0,
        }}
      >
        {children}
      </Text>
    </Section>
  );
}

export { emailColors, emailFontFamily };
