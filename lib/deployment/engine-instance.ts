import "server-only";

import { createDeploymentEngine, type DeploymentEngine } from "./engine";
import { readLocalSettings } from "@/lib/settings/local-settings";

let engine: DeploymentEngine | null = null;

export function getDeploymentEngine(): DeploymentEngine {
  engine ??= createDeploymentEngine({
    settingsLoader: () => readLocalSettings(),
  });
  return engine;
}
