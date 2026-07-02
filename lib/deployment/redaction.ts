export const REDACTION_MARKER = "[REDACTED]";

export function redactSensitiveText(text: string, sensitiveValues: readonly string[]): string {
  return sensitiveValues
    .filter((value) => value.length > 0)
    .reduce((redacted, value) => redacted.split(value).join(REDACTION_MARKER), text);
}
