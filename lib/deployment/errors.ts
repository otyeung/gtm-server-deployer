import type { DeploymentError, DeploymentPhase } from "./types";
import { TerraformCommandError } from "@/lib/terraform/runner";

export class DeploymentEngineError extends Error {
  readonly deploymentError: DeploymentError;

  constructor(deploymentError: DeploymentError) {
    super(deploymentError.message);
    this.name = "DeploymentEngineError";
    this.deploymentError = deploymentError;
  }
}

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown deployment failure";
}

function getLogExcerpt(error: unknown): string | undefined {
  if (error instanceof TerraformCommandError) {
    return error.logExcerpt;
  }

  return undefined;
}

function getSearchableText(error: unknown): string {
  if (error instanceof TerraformCommandError) {
    return [error.message, error.stdout, error.stderr].filter((value) => value.length > 0).join("\n");
  }

  return getMessage(error);
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return error.code === expectedCode;
}

export function normalizeError(error: unknown, phase: DeploymentPhase): DeploymentError {
  if (error instanceof DeploymentEngineError) {
    return error.deploymentError;
  }

  const message = getMessage(error);
  const logExcerpt = getLogExcerpt(error);
  const searchableText = getSearchableText(error);
  const lowerMessage = searchableText.toLowerCase();

  if (lowerMessage.includes("permission denied") || lowerMessage.includes("forbidden")) {
    return {
      category: "permission_denied",
      phase,
      message,
      logExcerpt,
      remediation:
        "Verify the active gcloud account has IAM permissions for Cloud Run, Secret Manager, IAM, Compute, Certificate Manager, and Cloud DNS."
    };
  }

  if (lowerMessage.includes("quota")) {
    return {
      category: "quota_exceeded",
      phase,
      message,
      logExcerpt,
      remediation:
        "Open the Google Cloud quota page for the selected project and request quota or choose a smaller region/resource size."
    };
  }

  if (
    hasErrorCode(error, "ENOENT") ||
    (lowerMessage.includes("enoent") && lowerMessage.includes("terraform")) ||
    (lowerMessage.includes("not found") && lowerMessage.includes("terraform"))
  ) {
    return {
      category: "missing_binary",
      phase,
      message,
      logExcerpt,
      remediation: "Install Terraform or configure the Terraform binary path in Settings."
    };
  }

  return {
    category: "unknown",
    phase,
    message,
    logExcerpt,
    remediation: "Review the Terraform log excerpt, fix the reported issue, then run the failed step again."
  };
}
