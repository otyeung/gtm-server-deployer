import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDeploymentEngine } from "@/lib/deployment/engine";
import { getWorkspacePaths } from "@/lib/deployment/paths";
import type { DeploymentInput } from "@/lib/schemas/deployment";
import type { TerraformCommandOptions, TerraformCommandResult } from "@/lib/terraform/runner";
import { readDeploymentState, writeDeploymentState, writeTerraformOutputs } from "@/lib/deployment/workspace";
import type { TerraformOutputMap } from "@/lib/deployment/types";

const input: DeploymentInput = {
  provider: "gcp",
  projectId: "gtm-server-deployer",
  region: "asia-southeast1",
  environment: "dev",
  containerImage: "gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable",
  cpu: "1",
  memory: "512Mi",
  minInstances: 0,
  maxInstances: 3,
  gtmContainerConfig: "secret-config",
  enablePreviewServer: true,
  useHttps: true,
  useManagedSsl: true,
  customDomain: "",
  enableCloudDns: false
};

let rootDir: string;
let terraformModuleDir: string;
let spawnedProcesses: ChildProcess[] = [];

type LockTargetMetadata = {
  operation: "plan" | "apply" | "destroy";
  pid: number;
  ownerId: string;
  processStartedAt: string;
  acquiredAt: string;
};

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

beforeEach(async () => {
  rootDir = path.join(process.cwd(), ".test-workspaces", `engine-${randomUUID()}`);
  terraformModuleDir = path.join(rootDir, "terraform-module");
  spawnedProcesses = [];
  await mkdir(rootDir, { recursive: true });
  await mkdir(terraformModuleDir, { recursive: true });
  await writeFile(path.join(terraformModuleDir, "main.tf"), 'terraform {}\n', "utf8");
});

afterEach(async () => {
  for (const child of spawnedProcesses) {
    if (child.pid !== undefined && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  await rm(rootDir, { force: true, recursive: true });
});

function parseLockTarget(target: string): LockTargetMetadata | null {
  if (!target.startsWith("v2:")) {
    return null;
  }

  const parsed = JSON.parse(decodeURIComponent(target.slice(3))) as Partial<LockTargetMetadata>;
  if (
    (parsed.operation !== "plan" && parsed.operation !== "apply" && parsed.operation !== "destroy")
    || !Number.isInteger(parsed.pid)
    || typeof parsed.ownerId !== "string"
    || typeof parsed.processStartedAt !== "string"
    || typeof parsed.acquiredAt !== "string"
  ) {
    return null;
  }

  return parsed as LockTargetMetadata;
}

function encodeLockTarget(metadata: LockTargetMetadata): string {
  return `v2:${encodeURIComponent(JSON.stringify(metadata))}`;
}

describe("createDeploymentEngine", () => {
  it("runs init and plan before marking deployment planned", async () => {
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths: getWorkspacePaths(rootDir),
      runner,
      terraformModuleDir
    });

    const state = await engine.plan(input);

    expect(state.phase).toBe("planned");
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
  });

  it("requires a successful plan before apply", async () => {
    const engine = createDeploymentEngine({ paths: getWorkspacePaths(rootDir), runner: vi.fn() });

    await expect(engine.apply()).rejects.toThrow("Run a successful Terraform plan before apply.");
  });

  it("runs apply after a successful plan", async () => {
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: options.command === "output" ? "{}" : "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths: getWorkspacePaths(rootDir),
      runner,
      terraformModuleDir
    });

    await engine.plan(input);
    const state = await engine.apply();

    expect(state.phase).toBe("applied");
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan", "apply", "output"]);
  });

  it("rehydrates sensitive values for apply after process restart", async () => {
    const paths = getWorkspacePaths(rootDir);
    const planningRunner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const planningEngine = createDeploymentEngine({
      paths,
      runner: planningRunner,
      terraformModuleDir
    });

    await planningEngine.plan(input);

    const restartedRunner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => {
        const emittedValue = options.sensitiveValues.includes(input.gtmContainerConfig) ? "[REDACTED]" : input.gtmContainerConfig;
        await options.onLog?.(`${options.command}:${emittedValue}`);

        return {
          command: options.command,
          exitCode: 0,
          stdout: options.command === "output" ? "{}" : "",
          stderr: "",
          logCallbackErrors: []
        };
      },
    );
    const restartedEngine = createDeploymentEngine({
      paths,
      runner: restartedRunner,
      terraformModuleDir
    });

    const state = await restartedEngine.apply();
    const logs = await restartedEngine.getLogs();

    expect(state.phase).toBe("applied");
    expect(restartedRunner.mock.calls.find(([call]) => call.command === "apply")?.[0].sensitiveValues).toEqual([
      input.gtmContainerConfig
    ]);
    expect(JSON.stringify(state)).not.toContain(input.gtmContainerConfig);
    expect(JSON.stringify(await readDeploymentState(paths))).not.toContain(input.gtmContainerConfig);
    expect(logs).toContain("[REDACTED]");
    expect(logs).not.toContain(input.gtmContainerConfig);
  });

  it("rejects a concurrent plan while another plan is running", async () => {
    const initStarted = createDeferred();
    const releaseInit = createDeferred();
    let initCalls = 0;
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => {
        if (options.command === "init") {
          initCalls += 1;
          if (initCalls === 1) {
            initStarted.resolve();
            await releaseInit.promise;
          }
        }

        return {
          command: options.command,
          exitCode: 0,
          stdout: "",
          stderr: "",
          logCallbackErrors: []
        };
      },
    );
    const engine = createDeploymentEngine({
      paths: getWorkspacePaths(rootDir),
      runner,
      terraformModuleDir
    });

    const firstPlan = engine.plan(input);
    await initStarted.promise;

    const secondPlan = engine.plan(input);
    releaseInit.resolve();

    const [firstResult, secondResult] = await Promise.allSettled([firstPlan, secondPlan]);

    expect(firstResult).toMatchObject({ status: "fulfilled", value: expect.objectContaining({ phase: "planned" }) });
    expect(secondResult).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({
        message: expect.stringContaining("Another deployment operation is already running")
      })
    });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
  });

  it("releases the in-memory operation lock when workspace setup fails", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await writeFile(paths.workspaceDir, "blocked", "utf8");
    await expect(engine.plan(input)).rejects.toMatchObject({ code: "EEXIST" });

    await rm(paths.workspaceDir, { force: true, recursive: true });

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned" });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
  });

  it("recovers a stale persisted lock and active operation before planning again", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await writeDeploymentState(paths, {
      phase: "planning",
      activeOperation: "plan",
      projectId: input.projectId,
      region: input.region,
      startedAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:01:00.000Z",
      lastSuccessfulPlanAt: null,
      error: null
    });
    await mkdir(paths.operationLockDir, { recursive: true });
    await writeFile(
      path.join(paths.operationLockDir, "metadata.json"),
      `${JSON.stringify({ operation: "plan", pid: 999999, acquiredAt: "2026-07-02T00:01:00.000Z" }, null, 2)}\n`,
      "utf8",
    );

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
    await expect(readDeploymentState(paths)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
  });

  it("recovers a legacy lock with the current pid even if its timestamp is old", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await mkdir(paths.operationLockDir, { recursive: true });
    await writeFile(
      path.join(paths.operationLockDir, "metadata.json"),
      `${JSON.stringify({ operation: "plan", pid: process.pid, acquiredAt: "2026-07-02T00:01:00.000Z" }, null, 2)}\n`,
      "utf8",
    );

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
  });

  it("recovers a dead lock owner and allows planning to proceed", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await mkdir(paths.operationLockDir, { recursive: true });
    await writeFile(
      path.join(paths.operationLockDir, "metadata.json"),
      `${JSON.stringify({ operation: "plan", pid: 999999, acquiredAt: "2026-07-02T00:01:00.000Z" }, null, 2)}\n`,
      "utf8",
    );

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
  });

  it("recovers a lock with the current pid when the owner identity changed", async () => {
    const paths = getWorkspacePaths(rootDir);
    const initStarted = createDeferred();
    const releaseInit = createDeferred();
    let initCalls = 0;
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => {
        if (options.command === "init") {
          initCalls += 1;
          if (initCalls === 1) {
            initStarted.resolve();
            await releaseInit.promise;
          }
        }

        return {
          command: options.command,
          exitCode: 0,
          stdout: "",
          stderr: "",
          logCallbackErrors: []
        };
      },
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    const firstPlan = engine.plan(input);
    await initStarted.promise;
    const activeLockMetadata = parseLockTarget(await readlink(paths.operationLockDir));
    expect(activeLockMetadata).not.toBeNull();
    releaseInit.resolve();
    await firstPlan;

    await mkdir(paths.workspaceDir, { recursive: true });
    await symlink(
      encodeLockTarget({
        ...activeLockMetadata!,
        ownerId: randomUUID()
      }),
      paths.operationLockDir,
    );

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan", "init", "plan"]);
  });

  it("keeps a lock with the current owner identity active", async () => {
    const paths = getWorkspacePaths(rootDir);
    const initStarted = createDeferred();
    const releaseInit = createDeferred();
    let initCalls = 0;
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => {
        if (options.command === "init") {
          initCalls += 1;
          if (initCalls === 1) {
            initStarted.resolve();
            await releaseInit.promise;
          }
        }

        return {
          command: options.command,
          exitCode: 0,
          stdout: "",
          stderr: "",
          logCallbackErrors: []
        };
      },
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    const firstPlan = engine.plan(input);
    await initStarted.promise;
    const activeLockTarget = await readlink(paths.operationLockDir);
    const activeLockMetadata = parseLockTarget(activeLockTarget);
    expect(activeLockMetadata).not.toBeNull();
    releaseInit.resolve();
    await firstPlan;

    await mkdir(paths.workspaceDir, { recursive: true });
    await symlink(activeLockTarget, paths.operationLockDir);

    await expect(engine.plan(input)).rejects.toMatchObject({
      message: expect.stringContaining("Another deployment operation is already running: plan")
    });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
  });

  it("does not recover a live lock owned by another running process", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore"
    });
    spawnedProcesses.push(child);

    await mkdir(paths.workspaceDir, { recursive: true });
    await symlink(
      encodeLockTarget({
        operation: "plan",
        pid: child.pid!,
        ownerId: randomUUID(),
        processStartedAt: "2026-07-02T00:00:00.000Z",
        acquiredAt: "2026-07-02T00:01:00.000Z"
      }),
      paths.operationLockDir,
    );

    await expect(engine.plan(input)).rejects.toMatchObject({
      message: expect.stringContaining("Another deployment operation is already running: plan")
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("treats a lock with missing metadata as active instead of recovering it", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await mkdir(paths.operationLockDir, { recursive: true });

    await expect(engine.plan(input)).rejects.toMatchObject({
      message: expect.stringContaining("Another deployment operation is already running: plan")
    });
    expect(runner).not.toHaveBeenCalled();
  });

  it("recovers a legacy lock with the current pid when owner identity metadata is missing", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await mkdir(paths.operationLockDir, { recursive: true });
    await writeFile(
      path.join(paths.operationLockDir, "metadata.json"),
      `${JSON.stringify({ operation: "plan", pid: process.pid, acquiredAt: "2026-07-02T00:01:00.000Z" }, null, 2)}\n`,
      "utf8",
    );

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
    await expect(readDeploymentState(paths)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
  });

  it("recovers a persisted active operation when no live lock remains", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await writeDeploymentState(paths, {
      phase: "planning",
      activeOperation: "plan",
      projectId: input.projectId,
      region: input.region,
      startedAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:01:00.000Z",
      lastSuccessfulPlanAt: null,
      error: null
    });

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
    expect(runner.mock.calls.map(([call]) => call.command)).toEqual(["init", "plan"]);
    await expect(readDeploymentState(paths)).resolves.toMatchObject({ phase: "planned", activeOperation: null });
  });

  it("preserves old outputs when a new plan reaches planned state without apply", async () => {
    const outputs: TerraformOutputMap = {
      service_url: { sensitive: false, type: "string", value: "https://old.example.com" }
    };
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await writeTerraformOutputs(paths, outputs);
    await engine.plan(input);

    expect(await engine.getOutputs()).toEqual(outputs);
  });

  it("preserves old outputs when a new plan fails", async () => {
    const outputs: TerraformOutputMap = {
      service_url: { sensitive: false, type: "string", value: "https://old.example.com" }
    };
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => {
        if (options.command === "plan") {
          throw new Error("plan failed");
        }

        return {
          command: options.command,
          exitCode: 0,
          stdout: "",
          stderr: "",
          logCallbackErrors: []
        };
      },
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await writeTerraformOutputs(paths, outputs);

    await expect(engine.plan(input)).resolves.toMatchObject({ phase: "failed", activeOperation: null });
    expect(await engine.getOutputs()).toEqual(outputs);
  });

  it("recovers stale persisted active operation state when reading status without a live lock", async () => {
    const paths = getWorkspacePaths(rootDir);
    const engine = createDeploymentEngine({
      paths,
      runner: vi.fn(),
      terraformModuleDir
    });

    await writeDeploymentState(paths, {
      phase: "planning",
      activeOperation: "plan",
      projectId: input.projectId,
      region: input.region,
      startedAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:01:00.000Z",
      lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
      error: null
    });

    await expect(engine.getStatus()).resolves.toMatchObject({
      phase: "failed",
      activeOperation: null,
      error: {
        message: expect.stringContaining("Recovered stale deployment operation: plan")
      }
    });
    await expect(readDeploymentState(paths)).resolves.toMatchObject({
      phase: "failed",
      activeOperation: null
    });
  });

  it("recreates the Terraform workdir so removed module files do not persist", async () => {
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });
    const staleTerraformFile = path.join(paths.gcpWorkdir, "removed.tf");

    await mkdir(paths.gcpWorkdir, { recursive: true });
    await writeFile(staleTerraformFile, "# stale terraform file\n", "utf8");

    await engine.plan(input);

    await expect(readFile(staleTerraformFile, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(path.join(paths.gcpWorkdir, "main.tf"), "utf8")).resolves.toBe("terraform {}\n");
  });

  it("clears old outputs after a successful destroy", async () => {
    const outputs: TerraformOutputMap = {
      service_url: { sensitive: false, type: "string", value: "https://old.example.com" }
    };
    const paths = getWorkspacePaths(rootDir);
    const runner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const engine = createDeploymentEngine({
      paths,
      runner,
      terraformModuleDir
    });

    await writeDeploymentState(paths, {
      phase: "applied",
      activeOperation: null,
      projectId: input.projectId,
      region: input.region,
      startedAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:01:00.000Z",
      lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
      error: null
    });
    await writeTerraformOutputs(paths, outputs);

    const state = await engine.destroy();

    expect(state.phase).toBe("destroyed");
    expect(await engine.getOutputs()).toEqual({});
  });

  it("redacts persisted secrets from logs after process restart", async () => {
    const paths = getWorkspacePaths(rootDir);
    const planningRunner = vi.fn(
      async (options: TerraformCommandOptions): Promise<TerraformCommandResult> => ({
        command: options.command,
        exitCode: 0,
        stdout: "",
        stderr: "",
        logCallbackErrors: []
      }),
    );
    const planningEngine = createDeploymentEngine({
      paths,
      runner: planningRunner,
      terraformModuleDir
    });

    await planningEngine.plan(input);
    await writeFile(paths.logFile, `terraform:${input.gtmContainerConfig}\n`, "utf8");

    const restartedEngine = createDeploymentEngine({
      paths,
      runner: vi.fn(),
      terraformModuleDir
    });

    await expect(restartedEngine.getLogs()).resolves.toContain("[REDACTED]");
    await expect(restartedEngine.getLogs()).resolves.not.toContain(input.gtmContainerConfig);
  });
});
