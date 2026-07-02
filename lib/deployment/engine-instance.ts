import "server-only";

import { createDeploymentEngine, type DeploymentEngine } from "./engine";

let engine: DeploymentEngine | null = null;

export function getDeploymentEngine(): DeploymentEngine {
  engine ??= createDeploymentEngine();
  return engine;
}
