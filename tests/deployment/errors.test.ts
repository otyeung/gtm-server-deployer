import { describe, expect, it } from "vitest";
import { DeploymentEngineError, normalizeError } from "@/lib/deployment/errors";

describe("normalizeError", () => {
  it("keeps explicit deployment errors actionable", () => {
    const normalized = normalizeError(
      new DeploymentEngineError({
        category: "missing_binary",
        phase: "planning",
        message: "Terraform binary was not found",
        remediation: "Install Terraform or configure the Terraform path in Settings."
      }),
      "planning",
    );

    expect(normalized.category).toBe("missing_binary");
    expect(normalized.remediation).toContain("Install Terraform");
  });

  it("classifies permission denied messages", () => {
    const normalized = normalizeError(new Error("permission denied by IAM"), "applying");

    expect(normalized.category).toBe("permission_denied");
  });
});
