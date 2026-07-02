import { z } from "zod";

export const DEFAULT_LOCAL_SETTINGS = {
  terraformPath: "terraform",
  gcloudPath: "gcloud",
  dockerPath: "docker",
} as const;

export const settingsSchema = z.object({
  terraformPath: z.string().min(1).default(DEFAULT_LOCAL_SETTINGS.terraformPath),
  gcloudPath: z.string().min(1).default(DEFAULT_LOCAL_SETTINGS.gcloudPath),
  dockerPath: z.string().min(1).default(DEFAULT_LOCAL_SETTINGS.dockerPath),
});

export type LocalSettings = z.infer<typeof settingsSchema>;
