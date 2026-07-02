import { z } from "zod";

export const deploymentInputSchema = z
  .object({
    provider: z.literal("gcp"),
    projectId: z
      .string()
      .min(6, "Project ID must be at least 6 characters")
      .regex(/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, "Use a valid GCP project ID"),
    region: z.string().min(1).default("asia-southeast1"),
    environment: z.enum(["dev", "prod"]).default("dev"),
    containerImage: z
      .string()
      .min(1)
      .default("gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable"),
    cpu: z.enum(["1", "2", "4"]).default("1"),
    memory: z.enum(["512Mi", "1Gi", "2Gi", "4Gi"]).default("512Mi"),
    minInstances: z.number().int().min(0).max(10).default(0),
    maxInstances: z.number().int().min(1).max(100).default(3),
    gtmContainerConfig: z.string().min(8, "Paste the GTM server container config"),
    enablePreviewServer: z.boolean().default(true),
    useHttps: z.boolean().default(true),
    useManagedSsl: z.boolean().default(true),
    customDomain: z
      .string()
      .trim()
      .regex(/^$|^([a-z0-9-]+\.)+[a-z]{2,}$/i, "Use a valid domain name")
      .default(""),
    enableCloudDns: z.boolean().default(false),
  })
  .refine((value) => value.maxInstances >= value.minInstances, {
    path: ["maxInstances"],
    message: "Max instances must be greater than or equal to min instances",
  })
  .refine((value) => value.useHttps, {
    path: ["useHttps"],
    message: "Cloud Run HTTPS is always enabled in the MVP.",
  })
  .refine((value) => !value.enableCloudDns || value.customDomain.length > 0, {
    path: ["enableCloudDns"],
    message: "Cloud DNS automation requires a custom domain",
  });

export type DeploymentInput = z.infer<typeof deploymentInputSchema>;

export type DeploymentReview = Omit<DeploymentInput, "gtmContainerConfig"> & {
  gtmContainerConfig: "[REDACTED]";
};

export function serializeDeploymentInput(input: unknown): string | null {
  const parsed = deploymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  return JSON.stringify(parsed.data);
}

export function sanitizeDeploymentInputForReview(input: DeploymentInput): DeploymentReview {
  return {
    ...input,
    gtmContainerConfig: "[REDACTED]",
  };
}
