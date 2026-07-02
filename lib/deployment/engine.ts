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
  await cp(sourceDir, targetDir, { recursive: true, force: true });
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
  await ensureWorkspace(paths);

  try {
    await mkdir(paths.operationLockDir);
  } catch (error) {
    processOperationLocks.delete(workspaceKey);

    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      let activeOperation = operation;

      try {
        const metadata = JSON.parse(
          await readFile(path.join(paths.operationLockDir, "metadata.json"), "utf8"),
        ) as { operation?: string };
        activeOperation = metadata.operation ?? activeOperation;
      } catch {
        // Best effort only.
      }

      throw createOperationLockError(activeOperation);
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
