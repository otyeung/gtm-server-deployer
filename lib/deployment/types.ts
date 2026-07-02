export type DeploymentPhase =
  | "idle"
  | "planning"
  | "planned"
  | "applying"
  | "applied"
  | "destroying"
  | "destroyed"
  | "failed";

export type DeploymentOperation = "plan" | "apply" | "destroy";

export type DeploymentError = {
  category:
    | "missing_binary"
    | "not_authenticated"
    | "invalid_input"
    | "permission_denied"
    | "quota_exceeded"
    | "terraform_failed"
    | "cloud_run_failed"
    | "dns_pending"
    | "certificate_pending"
    | "unknown";
  phase: DeploymentPhase;
  message: string;
  remediation: string;
  logExcerpt?: string;
};

export type DeploymentState = {
  phase: DeploymentPhase;
  activeOperation: DeploymentOperation | null;
  projectId: string | null;
  region: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  lastSuccessfulPlanAt: string | null;
  error: DeploymentError | null;
};

export type DeploymentLog = string;

export type TerraformOutputValue = {
  sensitive: boolean;
  type: unknown;
  value: unknown;
};

export type TerraformOutputMap = Record<string, TerraformOutputValue>;

export type WorkspacePaths = {
  rootDir: string;
  workspaceDir: string;
  logsDir: string;
  workdir: string;
  gcpWorkdir: string;
  operationLockDir: string;
  stateFile: string;
  settingsFile: string;
  tfvarsFile: string;
  logFile: string;
  outputsFile: string;
};

export const EMPTY_DEPLOYMENT_STATE: DeploymentState = {
  phase: "idle",
  activeOperation: null,
  projectId: null,
  region: null,
  startedAt: null,
  updatedAt: null,
  lastSuccessfulPlanAt: null,
  error: null
};
