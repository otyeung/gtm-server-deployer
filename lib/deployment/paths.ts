import path from "node:path";
import type { WorkspacePaths } from "./types";

export function getWorkspacePaths(rootDir = process.cwd()): WorkspacePaths {
  const workspaceDir = path.join(rootDir, ".gtm-server-deployer");
  const logsDir = path.join(workspaceDir, "logs");
  const workdir = path.join(workspaceDir, "workdir");
  const gcpWorkdir = path.join(workdir, "gcp");

  return {
    rootDir,
    workspaceDir,
    logsDir,
    workdir,
    gcpWorkdir,
    operationLockDir: path.join(workspaceDir, "operation.lock"),
    stateFile: path.join(workspaceDir, "state.json"),
    settingsFile: path.join(workspaceDir, "settings.json"),
    tfvarsFile: path.join(workspaceDir, "terraform.tfvars.json"),
    logFile: path.join(logsDir, "deployment.log"),
    outputsFile: path.join(workspaceDir, "outputs.json")
  };
}
