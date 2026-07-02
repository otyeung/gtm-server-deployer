import { readFile } from "node:fs/promises";
import { getWorkspacePaths } from "@/lib/deployment/paths";
import { DEFAULT_LOCAL_SETTINGS, settingsSchema, type LocalSettings } from "@/lib/schemas/settings";

export async function readLocalSettings(rootDir?: string): Promise<LocalSettings> {
  try {
    const raw = await readFile(getWorkspacePaths(rootDir).settingsFile, "utf8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return DEFAULT_LOCAL_SETTINGS;
    }

    throw error;
  }
}
