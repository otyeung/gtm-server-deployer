import { redactSensitiveText } from "@/lib/deployment/redaction";

describe("redactSensitiveText", () => {
  it("replaces every sensitive value with a stable marker", () => {
    const result = redactSensitiveText("config=secret-value again secret-value", ["secret-value"]);

    expect(result).toBe("config=[REDACTED] again [REDACTED]");
  });

  it("ignores empty sensitive values", () => {
    expect(redactSensitiveText("safe", [""])).toBe("safe");
  });
});
