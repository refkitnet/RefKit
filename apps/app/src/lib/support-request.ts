export const SUPPORT_REQUEST_TYPES = [
  {
    value: "support_inquiry",
    label: "Support inquiry",
  },
  {
    value: "bug_report",
    label: "Report a bug",
  },
  {
    value: "feature_request",
    label: "Feature request",
  },
] as const;

export type SupportRequestType =
  (typeof SUPPORT_REQUEST_TYPES)[number]["value"];

export const DEFAULT_SUPPORT_REQUEST_TYPE: SupportRequestType =
  "support_inquiry";

export function isSupportRequestType(
  value: string
): value is SupportRequestType {
  return SUPPORT_REQUEST_TYPES.some((item) => item.value === value);
}

export function getSupportRequestTypeLabel(type: SupportRequestType) {
  return (
    SUPPORT_REQUEST_TYPES.find((item) => item.value === type)?.label ?? type
  );
}
