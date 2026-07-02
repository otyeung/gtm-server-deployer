import "server-only";

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { deploymentInputSchema, type DeploymentInput } from "@/lib/schemas/deployment";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/schemas/settings";
import {
  runTerraformCommand,
  type TerraformCommandOptions,
  type TerraformCommandResult
} from "@/lib/terraform/runner";
import { DeploymentEngineError, normalizeError } from "./errors";
import { getWorkspacePaths } from "./paths";
import type { DeploymentState, TerraformOutputMap, WorkspacePaths } from "./types";
import {
  appendDeploymentLog,
  clearTerraformOutputs,
  ensureWorkspace,
  readDeploymentLog,
  readDeploymentState,
  readTerraformOutputs,
  writeDeploymentState,
  writeTerraformOutputs,
  writeTerraformVars
} from "./workspace";

export type TerraformRunner = (
  options: TerraformCommandOptions,
) => Promise<TerraformCommandResult>;

export type DeploymentEngineOptions = {
  paths?: WorkspacePaths;
  settings?: LocalSettings;
  runner?: TerraformRunner;
  terraformModuleDir?: string;
};

export type DeploymentEngine = {
  plan(input: DeploymentInput): Promise<DeploymentState>;
  apply(): Promise<DeploymentState>;
  destroy(): Promise<DeploymentState>;
  getStatus(): Promise<DeploymentState>;
  getLogs(): Promise<string>;
  getOutputs(): Promise<TerraformOutputMap>;
};

function now(): string {
  return new Date().toISOString();
}

const processOperationLocks = new Map<string, string>();
const STALE_OPERATION_LOCK_MAX_AGE_MS = 1000 * 60 * 30;
const ACTIVE_OPERATIONS = new Set(["plan", "apply", "destroy"]);

type OperationLockMetadata = {
  operation?: string;
  pid?: number;
  acquiredAt?: string;
};

function isDeploymentOperation(value: string | null | undefined): value is "plan" | "apply" | "destroy" {
  return value !== undefined && value !== null && ACTIVE_OPERATIONS.has(value);
}

function getOperationLabel(
  operation: string | null | undefined,
  fallback: "plan" | "apply" | "destroy",
): "plan" | "apply" | "destroy" {
  return isDeploymentOperation(operation) ? operation : fallback;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function getStaleLockReason(metadata: OperationLockMetadata | null): string | null {
  if (!metadata) {
    return "invalid lock metadata";
  }

  if (!Number.isInteger(metadata.pid) || (metadata.pid ?? 0) <= 0) {
    return "invalid lock pid";
  }

  if (typeof metadata.acquiredAt !== "string") {
    return "missing lock timestamp";
  }

  const acquiredAt = Date.parse(metadata.acquiredAt);
  if (Number.isNaN(acquiredAt)) {
    return "invalid lock timestamp";
  }

  if (Date.now() - acquiredAt > STALE_OPERATION_LOCK_MAX_AGE_MS) {
    return "expired lock timestamp";
  }

  if (!isProcessAlive(metadata.pid)) {
    return "lock owner is not running";
  }

  return null;
}

function createOperationLockError(activeOperation: string): DeploymentEngineError {
  return new DeploymentEngineError({
    category: "terraform_failed",
    phase: "failed",
    message: `Another deployment operation is already running: ${activeOperation}`,
    remediation: "Wait for the active operation to finish before starting another deployment action."
  });
}

function assertNoActiveOperation(state: DeploymentState): void {
  if (state.activeOperation) {
    throw new DeploymentEngineError({
      category: "terraform_failed",
      phase: state.phase,
      message: `Another deployment operation is already running: ${state.activeOperation}`,
      remediation: "Wait for the active operation to finish before starting another deployment action."
    });
  }
}

async function copyTerraformModule(sourceDir: string, targetDir: string): Promise<void> {
  await rm(targetDir, { force: true, recursive: true });
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

async function readOperationLockMetadata(paths: WorkspacePaths): Promise<OperationLockMetadata | null> {
  try {
    return JSON.parse(await readFile(path.join(paths.operationLockDir, "metadata.json"), "utf8")) as OperationLockMetadata;
  } catch {
    return null;
  }
}

async function markStaleOperationRecovered(
  paths: WorkspacePaths,
  fallbackOperation: "plan" | "apply" | "destroy",
  staleReason: string,
  metadata: OperationLockMetadata | null,
): Promise<void> {
  const state = await readDeploymentState(paths);
  const recoveredOperation = getOperationLabel(metadata?.operation ?? state.activeOperation, fallbackOperation);

  if (state.activeOperation || ["planning", "applying", "destroying"].includes(state.phase)) {
    await writeDeploymentState(paths, {
      ...state,
      phase: "failed",
      activeOperation: null,
      updatedAt: now(),
      error: {
        category: "terraform_failed",
        phase: "failed",
        message: `Recovered stale deployment operation: ${recoveredOperation} (${staleReason}).`,
        remediation: "Retry the deployment action."
      }
    });
  }
}

async function recoverStaleOperationLock(
  paths: WorkspacePaths,
  fallbackOperation: "plan" | "apply" | "destroy",
  staleReason: string,
  metadata: OperationLockMetadata | null,
): Promise<void> {
  await markStaleOperationRecovered(paths, fallbackOperation, staleReason, metadata);
  await rm(paths.operationLockDir, { force: true, recursive: true });
}

async function acquireOperationGuard(
  paths: WorkspacePaths,
  operation: "plan" | "apply" | "destroy",
): Promise<() => Promise<void>> {
  const workspaceKey = paths.workspaceDir;
  const activeProcessOperation = processOperationLocks.get(workspaceKey);
  if (activeProcessOperation) {
    throw createOperationLockError(activeProcessOperation);
  }

  processOperationLocks.set(workspaceKey, operation);
  try {
    await ensureWorkspace(paths);
  } catch (error) {
    processOperationLocks.delete(workspaceKey);
    throw error;
  }

  try {
    await mkdir(paths.operationLockDir);
  } catch (error) {
    processOperationLocks.delete(workspaceKey);

    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const metadata = await readOperationLockMetadata(paths);
      const staleReason = getStaleLockReason(metadata);

      if (staleReason) {
        await recoverStaleOperationLock(paths, operation, staleReason, metadata);
        return acquireOperationGuard(paths, operation);
      }

      throw createOperationLockError(getOperationLabel(metadata?.operation, operation));
    }

    throw error;
  }

  try {
    await writeFile(
      path.join(paths.operationLockDir, "metadata.json"),
      `${JSON.stringify({ operation, pid: process.pid, acquiredAt: now() }, null, 2)}\n`,
      "utf8",
    );
  } catch (error) {
    processOperationLocks.delete(workspaceKey);
    await rm(paths.operationLockDir, { force: true, recursive: true });
    throw error;
  }

  let released = false;

  return async () => {
    if (released) {
      return;
    }

    released = true;
    processOperationLocks.delete(workspaceKey);
    await rm(paths.operationLockDir, { force: true, recursive: true });
  };
}

export function createDeploymentEngine(options: DeploymentEngineOptions = {}): DeploymentEngine {
  const paths = options.paths ?? getWorkspacePaths();
  const settings = options.settings ?? DEFAULT_LOCAL_SETTINGS;
  const runner = options.runner ?? runTerraformCommand;
  const terraformModuleDir = options.terraformModuleDir ?? path.join(process.cwd(), "terraform", "gcp");
  let sensitiveValues: string[] = [];

  async function run(command: TerraformCommandOptions["command"], args: readonly string[]) {
    return runner({
      binaryPath: settings.terraformPath,
      command,
      args,
      cwd: paths.gcpWorkdir,
      sensitiveValues,
      onLog: (chunk) => appendDeploymentLog(paths, chunk)
    });
  }

  async function setState(nextState: DeploymentState): Promise<DeploymentState> {
    await writeDeploymentState(paths, nextState);
    return nextState;
  }

  return {
    async plan(rawInput) {
      const input = deploymentInputSchema.parse(rawInput);
      sensitiveValues = [input.gtmContainerConfig];
      const releaseGuard = await acquireOperationGuard(paths, "plan");

      try {
        const previous = await readDeploymentState(paths);
        assertNoActiveOperation(previous);

        const startedAt = now();
        await clearTerraformOutputs(paths);
        await setState({
          phase: "planning",
          activeOperation: "plan",
          projectId: input.projectId,
          region: input.region,
          startedAt,
          updatedAt: startedAt,
          lastSuccessfulPlanAt: previous.lastSuccessfulPlanAt,
          error: null
        });

        try {
          await copyTerraformModule(terraformModuleDir, paths.gcpWorkdir);
          await writeTerraformVars(paths, input);
          await run("init", ["-input=false", "-no-color"]);
          await run("plan", ["-input=false", "-no-color", `-var-file=${paths.tfvarsFile}`, "-out=tfplan"]);

          return setState({
            phase: "planned",
            activeOperation: null,
            projectId: input.projectId,
            region: input.region,
            startedAt,
            updatedAt: now(),
            lastSuccessfulPlanAt: now(),
            error: null
          });
        } catch (error) {
          const deploymentError = normalizeError(error, "planning");
          return setState({
            phase: "failed",
            activeOperation: null,
            projectId: input.projectId,
            region: input.region,
            startedAt,
            updatedAt: now(),
            lastSuccessfulPlanAt: previous.lastSuccessfulPlanAt,
            error: deploymentError
          });
        }
      } finally {
        await releaseGuard();
      }
    },

    async apply() {
      const releaseGuard = await acquireOperationGuard(paths, "apply");

      try {
        const state = await readDeploymentState(paths);
        assertNoActiveOperation(state);
        if (state.phase !== "planned" || !state.lastSuccessfulPlanAt) {
          throw new DeploymentEngineError({
            category: "terraform_failed",
            phase: state.phase,
            message: "Run a successful Terraform plan before apply.",
            remediation: "Open the Deploy wizard, run Review and Plan, then use Confirm Apply."
          });
        }

        await setState({ ...state, phase: "applying", activeOperation: "apply", updatedAt: now() });
        try {
          await run("apply", ["-input=false", "-no-color", "tfplan"]);
          const outputResult = await run("output", ["-json"]);
          const outputs = JSON.parse(outputResult.stdout || "{}") as TerraformOutputMap;
          await writeTerraformOutputs(paths, outputs);
          return setState({ ...state, phase: "applied", activeOperation: null, updatedAt: now(), error: null });
        } catch (error) {
          const deploymentError = normalizeError(error, "applying");
          return setState({ ...state, phase: "failed", activeOperation: null, updatedAt: now(), error: deploymentError });
        }
      } finally {
        await releaseGuard();
      }
    },

    async destroy() {
      const releaseGuard = await acquireOperationGuard(paths, "destroy");

      try {
        const state = await readDeploymentState(paths);
        assertNoActiveOperation(state);
        await setState({ ...state, phase: "destroying", activeOperation: "destroy", updatedAt: now() });
        try {
          await run("destroy", ["-auto-approve", "-input=false", "-no-color", `-var-file=${paths.tfvarsFile}`]);
          await clearTerraformOutputs(paths);
          return setState({ ...state, phase: "destroyed", activeOperation: null, updatedAt: now(), error: null });
        } catch (error) {
          const deploymentError = normalizeError(error, "destroying");
          return setState({ ...state, phase: "failed", activeOperation: null, updatedAt: now(), error: deploymentError });
        }
      } finally {
        await releaseGuard();
      }
    },

    getStatus() {
      return readDeploymentState(paths);
    },

    getLogs() {
      return readDeploymentLog(paths, sensitiveValues);
    },

    getOutputs() {
      return readTerraformOutputs(paths);
    }
  };
}
