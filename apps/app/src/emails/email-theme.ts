export const emailColors = {
  background: "#FAF7F2",
  surface: "#FFFFFF",
  text: "#182548",
  mutedText: "#5B6475",
  border: "#E6E8EF",
  kitOrange: "#F76C13",
  kitText: "#A94300",
  onKitText: "#182548",
  warmTint: "#FFF3E8",
  success: "#16A34A",
  successSoft: "#F0FDF4",
  error: "#DC2626",
  errorSoft: "#FEF2F2",
} as const;

export const emailFontFamily =
  '"IBM Plex Sans", Helvetica, Arial, sans-serif';

export const emailMonoFontFamily =
  '"IBM Plex Mono", Menlo, Consolas, monospace';

export const emailStyles = {
  body: {
    backgroundColor: emailColors.background,
    fontFamily: emailFontFamily,
    margin: 0,
    padding: "32px 16px",
  },
  outerContainer: {
    margin: "0 auto",
    maxWidth: "520px",
  },
  card: {
    backgroundColor: emailColors.surface,
    border: `1px solid ${emailColors.border}`,
    borderRadius: "12px",
    padding: "32px",
  },
  brandRow: {
    marginBottom: "24px",
  },
  brandName: {
    color: emailColors.text,
    fontSize: "18px",
    fontWeight: "600",
    letterSpacing: "-0.02em",
    lineHeight: "32px",
    margin: 0,
    paddingLeft: "10px",
  },
  divider: {
    borderColor: emailColors.border,
    borderTop: "1px solid",
    margin: "0 0 24px",
  },
  heading: {
    color: emailColors.text,
    fontSize: "22px",
    fontWeight: "600",
    letterSpacing: "-0.02em",
    lineHeight: "28px",
    margin: "0 0 16px",
  },
  text: {
    color: emailColors.text,
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  mono: {
    color: emailColors.text,
    fontFamily: emailMonoFontFamily,
    fontSize: "14px",
    lineHeight: "22px",
    margin: "0 0 16px",
  },
  muted: {
    color: emailColors.mutedText,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "24px 0 0",
  },
  button: {
    backgroundColor: emailColors.kitOrange,
    borderRadius: "8px",
    color: emailColors.onKitText,
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "600",
    lineHeight: "1",
    margin: "8px 0 16px",
    padding: "12px 20px",
    textDecoration: "none",
  },
  siteFooter: {
    color: emailColors.mutedText,
    fontSize: "12px",
    lineHeight: "20px",
    margin: "16px 0 0",
    textAlign: "center" as const,
  },
  callout: {
    backgroundColor: emailColors.warmTint,
    border: `1px solid ${emailColors.border}`,
    borderRadius: "8px",
    margin: "0 0 16px",
    padding: "12px 16px",
  },
  calloutWarning: {
    backgroundColor: emailColors.errorSoft,
    borderLeft: `3px solid ${emailColors.error}`,
  },
  calloutSuccess: {
    backgroundColor: emailColors.successSoft,
    borderLeft: `3px solid ${emailColors.success}`,
  },
};
