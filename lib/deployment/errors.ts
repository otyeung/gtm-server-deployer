import type { DeploymentError, DeploymentPhase } from "./types";

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

export function normalizeError(error: unknown, phase: DeploymentPhase): DeploymentError {
  if (error instanceof DeploymentEngineError) {
    return error.deploymentError;
  }

  const message = getMessage(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("permission denied") || lowerMessage.includes("forbidden")) {
    return {
      category: "permission_denied",
      phase,
      message,
      remediation:
        "Verify the active gcloud account has IAM permissions for Cloud Run, Secret Manager, IAM, Compute, Certificate Manager, and Cloud DNS."
    };
  }

  if (lowerMessage.includes("quota")) {
    return {
      category: "quota_exceeded",
      phase,
      message,
      remediation:
        "Open the Google Cloud quota page for the selected project and request quota or choose a smaller region/resource size."
    };
  }

  if (lowerMessage.includes("not found") && lowerMessage.includes("terraform")) {
    return {
      category: "missing_binary",
      phase,
      message,
      remediation: "Install Terraform or configure the Terraform binary path in Settings."
    };
  }

  return {
    category: "unknown",
    phase,
    message,
    remediation: "Review the Terraform log excerpt, fix the reported issue, then run the failed step again."
  };
}
