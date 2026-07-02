import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  await mkdir(rootDir, { recursive: true });
  await mkdir(terraformModuleDir, { recursive: true });
  await writeFile(path.join(terraformModuleDir, "main.tf"), 'terraform {}\n', "utf8");
});

afterEach(async () => {
  await rm(rootDir, { force: true, recursive: true });
});

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

  it("clears old outputs when starting a new plan", async () => {
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

    expect(await engine.getOutputs()).toEqual({});
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
});
