import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { DeploymentInput } from "@/lib/schemas/deployment";
import { redactSensitiveText } from "./redaction";
import {
  EMPTY_DEPLOYMENT_STATE,
  type DeploymentLog,
  type DeploymentState,
  type TerraformOutputMap,
  type WorkspacePaths
} from "./types";

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function ensureWorkspace(paths: WorkspacePaths): Promise<void> {
  await mkdir(paths.workspaceDir, { recursive: true });
  await mkdir(paths.logsDir, { recursive: true });
  await mkdir(paths.workdir, { recursive: true });
  await mkdir(paths.gcpWorkdir, { recursive: true });
}

export async function readDeploymentState(paths: WorkspacePaths): Promise<DeploymentState> {
  return readJson(paths.stateFile, EMPTY_DEPLOYMENT_STATE);
}

export async function writeDeploymentState(
  paths: WorkspacePaths,
  state: DeploymentState,
): Promise<void> {
  await ensureWorkspace(paths);
  await writeJson(paths.stateFile, state);
}

export async function appendDeploymentLog(paths: WorkspacePaths, chunk: DeploymentLog): Promise<void> {
  await ensureWorkspace(paths);
  await writeFile(paths.logFile, `${chunk}\n`, { encoding: "utf8", flag: "a" });
}

export async function readDeploymentLog(
  paths: WorkspacePaths,
  sensitiveValues: readonly string[] = [],
): Promise<string> {
  try {
    return redactSensitiveText(await readFile(paths.logFile, "utf8"), sensitiveValues);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

export async function writeTerraformVars(
  paths: WorkspacePaths,
  input: DeploymentInput,
): Promise<void> {
  await ensureWorkspace(paths);
  await writeJson(paths.tfvarsFile, {
    project_id: input.projectId,
    region: input.region,
    environment: input.environment,
    container_image: input.containerImage,
    cpu: input.cpu,
    memory: input.memory,
    min_instances: input.minInstances,
    max_instances: input.maxInstances,
    gtm_container_config: input.gtmContainerConfig,
    enable_preview_server: input.enablePreviewServer,
    use_https: input.useHttps,
    use_managed_ssl: input.useManagedSsl,
    custom_domain: input.customDomain,
    enable_cloud_dns: input.enableCloudDns
  });
}

export async function readTerraformOutputs(paths: WorkspacePaths): Promise<TerraformOutputMap> {
  return readJson<TerraformOutputMap>(paths.outputsFile, {});
}

export async function writeTerraformOutputs(
  paths: WorkspacePaths,
  outputs: TerraformOutputMap,
): Promise<void> {
  await ensureWorkspace(paths);
  await writeJson(paths.outputsFile, outputs);
}
