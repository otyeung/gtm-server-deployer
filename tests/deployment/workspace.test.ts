import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getWorkspacePaths } from "@/lib/deployment/paths";
import {
  appendDeploymentLog,
  ensureWorkspace,
  readDeploymentLog,
  readDeploymentState,
  readTerraformOutputs,
  writeDeploymentState,
  writeTerraformOutputs,
  writeTerraformVars
} from "@/lib/deployment/workspace";
import type { DeploymentState, TerraformOutputMap } from "@/lib/deployment/types";

let rootDir: string;

beforeEach(async () => {
  rootDir = path.join(process.cwd(), ".test-workspaces", `deployment-${randomUUID()}`);
  await mkdir(rootDir, { recursive: true });
});

afterEach(async () => {
  await rm(rootDir, { force: true, recursive: true });
});

describe("workspace", () => {
  it("creates the expected workspace directories", async () => {
    const paths = getWorkspacePaths(rootDir);

    await ensureWorkspace(paths);

    expect((await stat(paths.logsDir)).isDirectory()).toBe(true);
    expect((await stat(paths.gcpWorkdir)).isDirectory()).toBe(true);
    await expect(stat(paths.stateFile)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("persists and reads deployment state", async () => {
    const paths = getWorkspacePaths(rootDir);
    const state: DeploymentState = {
      phase: "planned",
      activeOperation: null,
      projectId: "gtm-server-deployer",
      region: "asia-southeast1",
      startedAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:01:00.000Z",
      lastSuccessfulPlanAt: "2026-07-02T00:01:00.000Z",
      error: null
    };

    await ensureWorkspace(paths);
    await writeDeploymentState(paths, state);

    expect(await readDeploymentState(paths)).toEqual(state);
  });

  it("writes Terraform variables and outputs", async () => {
    const paths = getWorkspacePaths(rootDir);
    const outputs: TerraformOutputMap = {
      service_url: { sensitive: false, type: "string", value: "https://example.com" },
      admin_token: { sensitive: true, type: "string", value: "secret" }
    };

    await ensureWorkspace(paths);
    await writeTerraformVars(paths, {
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
    });
    await writeTerraformOutputs(paths, outputs);

    const tfvars = JSON.parse(await readFile(paths.tfvarsFile, "utf8"));
    expect(tfvars.gtm_container_config).toBe("secret-config");
    expect(await readTerraformOutputs(paths)).toEqual(outputs);
  });

  it("redacts sensitive values when reading logs", async () => {
    const paths = getWorkspacePaths(rootDir);

    await ensureWorkspace(paths);
    await appendDeploymentLog(paths, "Applying with secret-config");

    expect(await readDeploymentLog(paths, ["secret-config"])).toContain("[REDACTED]");
  });
});
