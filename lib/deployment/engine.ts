import "server-only";

import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, readlink, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { deploymentInputSchema, type DeploymentInput } from "@/lib/schemas/deployment";
import { DEFAULT_LOCAL_SETTINGS, type LocalSettings } from "@/lib/schemas/settings";
import {
  runTerraformCommand,
  type TerraformCommandOptions,
  type TerraformCommandResult,
} from "@/lib/terraform/runner";
import { DeploymentEngineError, normalizeError } from "./errors";
import { getWorkspacePaths } from "./paths";
import type {
  DeploymentOperation,
  DeploymentState,
  TerraformOutputMap,
  WorkspacePaths,
} from "./types";
import {
  appendDeploymentLog,
  clearTerraformOutputs,
  ensureWorkspace,
  readDeploymentLog,
  readPersistedSensitiveValues,
  readDeploymentState,
  readTerraformOutputs,
  writeDeploymentState,
  writeTerraformOutputs,
  writeTerraformVars,
} from "./workspace";

export type TerraformRunner = (options: TerraformCommandOptions) => Promise<TerraformCommandResult>;

export type DeploymentEngineOptions = {
  paths?: WorkspacePaths;
  settings?: LocalSettings;
  settingsLoader?: () => Promise<LocalSettings>;
  runner?: TerraformRunner;
  terraformModuleDir?: string;
};

export type DeploymentEngine = {
  plan(input: DeploymentInput): Promise<DeploymentState>;
  apply(planId: string): Promise<DeploymentState>;
  destroy(): Promise<DeploymentState>;
  getStatus(): Promise<DeploymentState>;
  getLogs(): Promise<string>;
  getOutputs(): Promise<TerraformOutputMap>;
};

function now(): string {
  return new Date().toISOString();
}

const processOperationLocks = new Map<string, string>();
const ACTIVE_OPERATIONS = new Set(["plan", "apply", "destroy"]);
const ACTIVE_PHASES = new Set(["planning", "applying", "destroying"]);
const PROCESS_LOCK_OWNER_ID = randomUUID();
const PROCESS_STARTED_AT = new Date(performance.timeOrigin).toISOString();

type OperationLockMetadata = {
  operation: DeploymentOperation;
  pid: number;
  ownerId: string | null;
  processStartedAt: string | null;
  acquiredAt: string;
};

type LegacyOperationLockMetadata = {
  operation?: string;
  pid?: number;
  ownerId?: string;
  processStartedAt?: string;
  acquiredAt?: string;
};

type OperationLockStatus =
  | {
      kind: "missing";
    }
  | {
      kind: "active";
      operation: DeploymentOperation;
      metadata: OperationLockMetadata | null;
    }
  | {
      kind: "recoverable";
      operation: DeploymentOperation;
      metadata: OperationLockMetadata;
      staleReason: string;
    };

function isDeploymentOperation(
  value: string | null | undefined,
): value is "plan" | "apply" | "destroy" {
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

function parseOperationLockMetadata(
  metadata: LegacyOperationLockMetadata | null,
): OperationLockMetadata | null {
  if (!metadata) {
    return null;
  }

  const pid = metadata.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  if (!isDeploymentOperation(metadata.operation)) {
    return null;
  }

  if (typeof metadata.acquiredAt !== "string") {
    return null;
  }

  const acquiredAt = Date.parse(metadata.acquiredAt);
  if (Number.isNaN(acquiredAt)) {
    return null;
  }

  const processStartedAt =
    typeof metadata.processStartedAt === "string" &&
    !Number.isNaN(Date.parse(metadata.processStartedAt))
      ? new Date(Date.parse(metadata.processStartedAt)).toISOString()
      : null;
  const ownerId =
    typeof metadata.ownerId === "string" && metadata.ownerId.length > 0 ? metadata.ownerId : null;

  return {
    operation: metadata.operation,
    pid,
    ownerId,
    processStartedAt,
    acquiredAt: new Date(acquiredAt).toISOString(),
  };
}

function createOperationLockError(activeOperation: string): DeploymentEngineError {
  return new DeploymentEngineError({
    category: "terraform_failed",
    phase: "failed",
    message: `Another deployment operation is already running: ${activeOperation}`,
    remediation:
      "Wait for the active operation to finish before starting another deployment action.",
  });
}

function assertNoActiveOperation(state: DeploymentState): void {
  if (state.activeOperation) {
    throw new DeploymentEngineError({
      category: "terraform_failed",
      phase: state.phase,
      message: `Another deployment operation is already running: ${state.activeOperation}`,
      remediation:
        "Wait for the active operation to finish before starting another deployment action.",
    });
  }
}

function getFallbackOperationForState(state: DeploymentState): DeploymentOperation {
  if (state.activeOperation) {
    return state.activeOperation;
  }

  switch (state.phase) {
    case "planning":
      return "plan";
    case "applying":
      return "apply";
    case "destroying":
      return "destroy";
    default:
      return "plan";
  }
}

function getActivePhaseForOperation(operation: DeploymentOperation): DeploymentState["phase"] {
  switch (operation) {
    case "plan":
      return "planning";
    case "apply":
      return "applying";
    case "destroy":
      return "destroying";
  }
}

async function copyTerraformModule(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await removeModuleSourceFiles(targetDir);
  await cp(sourceDir, targetDir, { recursive: true, force: true });
}

function isModuleSourceFile(fileName: string): boolean {
  return fileName === "README.md" || fileName.endsWith(".tf") || fileName.endsWith(".tftest.hcl");
}

async function removeModuleSourceFiles(targetDir: string): Promise<void> {
  let entries;

  try {
    entries = await readdir(targetDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".terraform") {
        continue;
      }

      await removeModuleSourceFiles(entryPath);
      continue;
    }

    if (isModuleSourceFile(entry.name)) {
      await rm(entryPath, { force: true, recursive: true });
    }
  }
}

async function readLegacyOperationLockMetadata(
  paths: WorkspacePaths,
): Promise<LegacyOperationLockMetadata | null> {
  try {
    return JSON.parse(
      await readFile(path.join(paths.operationLockDir, "metadata.json"), "utf8"),
    ) as LegacyOperationLockMetadata;
  } catch {
    return null;
  }
}

function encodeOperationLockTarget(metadata: OperationLockMetadata): string {
  return `v2:${encodeURIComponent(JSON.stringify(metadata))}`;
}

function parseOperationLockTarget(target: string): OperationLockMetadata | null {
  if (target.startsWith("v2:")) {
    try {
      return parseOperationLockMetadata(
        JSON.parse(decodeURIComponent(target.slice(3))) as LegacyOperationLockMetadata,
      );
    } catch {
      return null;
    }
  }

  const [operation, pidValue, ...timestampParts] = target.split(":");
  const acquiredAt = timestampParts.join(":");
  const pid = Number.parseInt(pidValue ?? "", 10);

  return parseOperationLockMetadata({
    operation,
    pid,
    acquiredAt,
  });
}

function getLockStaleReason(metadata: OperationLockMetadata): string | null {
  if (metadata.pid === process.pid) {
    if (metadata.ownerId === null || metadata.processStartedAt === null) {
      return "legacy lock is missing owner identity metadata";
    }

    if (metadata.ownerId !== null && metadata.ownerId !== PROCESS_LOCK_OWNER_ID) {
      return "lock owner identity does not match current process";
    }

    if (metadata.processStartedAt !== null && metadata.processStartedAt !== PROCESS_STARTED_AT) {
      return "lock owner start time does not match current process";
    }

    return null;
  }

  if (isProcessAlive(metadata.pid)) {
    return null;
  }

  return "lock owner is not running";
}

async function inspectOperationLock(
  paths: WorkspacePaths,
  fallbackOperation: DeploymentOperation,
): Promise<OperationLockStatus> {
  let stats;

  try {
    stats = await lstat(paths.operationLockDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing" };
    }

    throw error;
  }

  if (stats.isSymbolicLink()) {
    const metadata = parseOperationLockTarget(await readlink(paths.operationLockDir));

    if (!metadata) {
      return { kind: "active", operation: fallbackOperation, metadata: null };
    }

    const staleReason = getLockStaleReason(metadata);
    if (!staleReason) {
      return { kind: "active", operation: metadata.operation, metadata };
    }

    return { kind: "recoverable", operation: metadata.operation, metadata, staleReason };
  }

  if (stats.isDirectory()) {
    const metadata = parseOperationLockMetadata(await readLegacyOperationLockMetadata(paths));
    const operation = getOperationLabel(metadata?.operation, fallbackOperation);

    if (!metadata) {
      return { kind: "active", operation, metadata: null };
    }

    const staleReason = getLockStaleReason(metadata);
    if (!staleReason) {
      return { kind: "active", operation, metadata };
    }

    return { kind: "recoverable", operation, metadata, staleReason };
  }

  return { kind: "active", operation: fallbackOperation, metadata: null };
}

async function markStaleOperationRecovered(
  paths: WorkspacePaths,
  fallbackOperation: "plan" | "apply" | "destroy",
  staleReason: string,
  metadata: OperationLockMetadata | null,
): Promise<void> {
  const state = await readDeploymentState(paths);
  const recoveredOperation = getOperationLabel(
    metadata?.operation ?? state.activeOperation,
    fallbackOperation,
  );

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
        remediation: "Retry the deployment action.",
      },
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

async function recoverPersistedActiveOperation(
  paths: WorkspacePaths,
  fallbackOperation: DeploymentOperation,
): Promise<DeploymentState> {
  const state = await readDeploymentState(paths);

  if (state.activeOperation || ACTIVE_PHASES.has(state.phase)) {
    await markStaleOperationRecovered(
      paths,
      fallbackOperation,
      "missing live operation lock",
      null,
    );
    return readDeploymentState(paths);
  }

  return state;
}

async function recoverStatusState(
  paths: WorkspacePaths,
  state: DeploymentState,
): Promise<DeploymentState> {
  const fallbackOperation = getFallbackOperationForState(state);
  const lockStatus = await inspectOperationLock(paths, fallbackOperation);

  if (lockStatus.kind === "active") {
    if (state.activeOperation || ACTIVE_PHASES.has(state.phase)) {
      return state;
    }

    return {
      ...state,
      phase: getActivePhaseForOperation(lockStatus.operation),
      activeOperation: lockStatus.operation,
      startedAt: state.startedAt ?? lockStatus.metadata?.acquiredAt ?? null,
      updatedAt: lockStatus.metadata?.acquiredAt ?? state.updatedAt,
      error: null,
    };
  }

  if (lockStatus.kind === "recoverable") {
    await recoverStaleOperationLock(
      paths,
      fallbackOperation,
      lockStatus.staleReason,
      lockStatus.metadata,
    );
    return readDeploymentState(paths);
  }

  if (!(state.activeOperation || ACTIVE_PHASES.has(state.phase))) {
    return state;
  }

  return recoverPersistedActiveOperation(paths, fallbackOperation);
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
    await symlink(
      encodeOperationLockTarget({
        operation,
        pid: process.pid,
        ownerId: PROCESS_LOCK_OWNER_ID,
        processStartedAt: PROCESS_STARTED_AT,
        acquiredAt: now(),
      }),
      paths.operationLockDir,
    );
  } catch (error) {
    processOperationLocks.delete(workspaceKey);

    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      const lockStatus = await inspectOperationLock(paths, operation);

      if (lockStatus.kind === "missing") {
        return acquireOperationGuard(paths, operation);
      }

      if (lockStatus.kind === "recoverable") {
        await recoverStaleOperationLock(
          paths,
          operation,
          lockStatus.staleReason,
          lockStatus.metadata,
        );
        return acquireOperationGuard(paths, operation);
      }

      throw createOperationLockError(lockStatus.operation);
    }

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
  const settingsLoader =
    options.settingsLoader ?? (() => Promise.resolve(options.settings ?? DEFAULT_LOCAL_SETTINGS));
  const runner = options.runner ?? runTerraformCommand;
  const terraformModuleDir =
    options.terraformModuleDir ?? path.join(process.cwd(), "terraform", "gcp");

  async function run(
    settings: LocalSettings,
    command: TerraformCommandOptions["command"],
    args: readonly string[],
    sensitiveValues: readonly string[],
  ) {
    return runner({
      binaryPath: settings.terraformPath,
      command,
      args,
      cwd: paths.gcpWorkdir,
      sensitiveValues,
      onLog: (chunk) => appendDeploymentLog(paths, chunk),
    });
  }

  async function setState(nextState: DeploymentState): Promise<DeploymentState> {
    await writeDeploymentState(paths, nextState);
    return nextState;
  }

  return {
    async plan(rawInput) {
      const input = deploymentInputSchema.parse(rawInput);
      const releaseGuard = await acquireOperationGuard(paths, "plan");

      try {
        const previous = await recoverPersistedActiveOperation(paths, "plan");
        assertNoActiveOperation(previous);

        const startedAt = now();
        await setState({
          phase: "planning",
          activeOperation: "plan",
          projectId: input.projectId,
          region: input.region,
          startedAt,
          updatedAt: startedAt,
          lastSuccessfulPlanAt: previous.lastSuccessfulPlanAt,
          lastSuccessfulPlanId: previous.lastSuccessfulPlanId,
          error: null,
        });

        try {
          const settings = await settingsLoader();
          await copyTerraformModule(terraformModuleDir, paths.gcpWorkdir);
          await writeTerraformVars(paths, input);
          await run(settings, "init", ["-input=false", "-no-color"], [input.gtmContainerConfig]);
          await run(
            settings,
            "plan",
            ["-input=false", "-no-color", `-var-file=${paths.tfvarsFile}`, "-out=tfplan"],
            [input.gtmContainerConfig],
          );

          const completedAt = now();
          const planId = randomUUID();

          return setState({
            phase: "planned",
            activeOperation: null,
            projectId: input.projectId,
            region: input.region,
            startedAt,
            updatedAt: completedAt,
            lastSuccessfulPlanAt: completedAt,
            lastSuccessfulPlanId: planId,
            error: null,
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
            lastSuccessfulPlanId: previous.lastSuccessfulPlanId,
            error: deploymentError,
          });
        }
      } finally {
        await releaseGuard();
      }
    },

    async apply(planId: string) {
      const releaseGuard = await acquireOperationGuard(paths, "apply");

      try {
        const state = await recoverPersistedActiveOperation(paths, "apply");
        assertNoActiveOperation(state);
        if (
          state.phase !== "planned" ||
          !state.lastSuccessfulPlanAt ||
          !state.lastSuccessfulPlanId
        ) {
          throw new DeploymentEngineError({
            category: "terraform_failed",
            phase: state.phase,
            message: "Run a successful Terraform plan before apply.",
            remediation: "Open the Deploy wizard, run Review and Plan, then use Confirm Apply.",
          });
        }

        if (planId.trim().length === 0 || planId !== state.lastSuccessfulPlanId) {
          throw new DeploymentEngineError({
            category: "invalid_input",
            phase: state.phase,
            message: "Confirm Apply must use the latest reviewed Terraform plan.",
            remediation: "Run Review and Plan again in the Deploy wizard before applying.",
          });
        }

        await setState({ ...state, phase: "applying", activeOperation: "apply", updatedAt: now() });
        try {
          const settings = await settingsLoader();
          const sensitiveValues = await readPersistedSensitiveValues(paths);
          await run(settings, "apply", ["-input=false", "-no-color", "tfplan"], sensitiveValues);
          const outputResult = await run(settings, "output", ["-json"], sensitiveValues);
          const outputs = JSON.parse(outputResult.stdout || "{}") as TerraformOutputMap;
          await writeTerraformOutputs(paths, outputs);
          return setState({
            ...state,
            phase: "applied",
            activeOperation: null,
            updatedAt: now(),
            error: null,
          });
        } catch (error) {
          const deploymentError = normalizeError(error, "applying");
          return setState({
            ...state,
            phase: "failed",
            activeOperation: null,
            updatedAt: now(),
            error: deploymentError,
          });
        }
      } finally {
        await releaseGuard();
      }
    },

    async destroy() {
      const releaseGuard = await acquireOperationGuard(paths, "destroy");

      try {
        const state = await recoverPersistedActiveOperation(paths, "destroy");
        assertNoActiveOperation(state);
        await setState({
          ...state,
          phase: "destroying",
          activeOperation: "destroy",
          updatedAt: now(),
        });
        try {
          const settings = await settingsLoader();
          await run(
            settings,
            "destroy",
            ["-auto-approve", "-input=false", "-no-color", `-var-file=${paths.tfvarsFile}`],
            await readPersistedSensitiveValues(paths),
          );
          await clearTerraformOutputs(paths);
          return setState({
            ...state,
            phase: "destroyed",
            activeOperation: null,
            updatedAt: now(),
            error: null,
          });
        } catch (error) {
          const deploymentError = normalizeError(error, "destroying");
          return setState({
            ...state,
            phase: "failed",
            activeOperation: null,
            updatedAt: now(),
            error: deploymentError,
          });
        }
      } finally {
        await releaseGuard();
      }
    },

    async getStatus() {
      const state = await readDeploymentState(paths);
      return recoverStatusState(paths, state);
    },

    async getLogs() {
      return readDeploymentLog(paths, await readPersistedSensitiveValues(paths));
    },

    getOutputs() {
      return readTerraformOutputs(paths);
    },
  };
}
