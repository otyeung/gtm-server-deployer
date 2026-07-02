import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createDeploymentEngine } from "@/lib/deployment/engine";
import { getWorkspacePaths } from "@/lib/deployment/paths";
import type { DeploymentInput } from "@/lib/schemas/deployment";
import type { TerraformCommandOptions, TerraformCommandResult } from "@/lib/terraform/runner";

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
});
