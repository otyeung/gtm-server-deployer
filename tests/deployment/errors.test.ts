import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DeploymentEngineError, normalizeError } from "@/lib/deployment/errors";
import { TerraformCommandError } from "@/lib/terraform/runner";

describe("normalizeError", () => {
  it("keeps explicit deployment errors actionable", () => {
    const normalized = normalizeError(
      new DeploymentEngineError({
        category: "missing_binary",
        phase: "planning",
        message: "Terraform binary was not found",
        remediation: "Install Terraform or configure the Terraform path in Settings.",
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

  it("classifies permission denied text from Terraform command errors", () => {
    const normalized = normalizeError(
      new TerraformCommandError({
        command: "apply",
        exitCode: 1,
        stdout: "",
        stderr: "Error: Permission denied by IAM policy",
      }),
      "applying",
    );

    expect(normalized.category).toBe("permission_denied");
  });

  it("classifies ENOENT spawn-shaped errors as missing Terraform binary", () => {
    const error = Object.assign(new Error("spawn terraform ENOENT"), { code: "ENOENT" });

    const normalized = normalizeError(error, "planning");

    expect(normalized.category).toBe("missing_binary");
    expect(normalized.remediation).toContain("Install Terraform");
  });
});
