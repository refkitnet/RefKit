export function required(value: string): string | undefined {
  if (value.trim().length === 0) {
    return "Required.";
  }

  return undefined;
}
