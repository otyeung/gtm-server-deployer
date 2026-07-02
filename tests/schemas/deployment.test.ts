import {
  deploymentInputSchema,
  sanitizeDeploymentInputForReview
} from "@/lib/schemas/deployment";

const validInput = {
  provider: "gcp",
  projectId: "gtm-server-deployer",
  region: "asia-southeast1",
  environment: "dev",
  containerImage: "gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable",
  cpu: "1",
  memory: "512Mi",
  minInstances: 0,
  maxInstances: 3,
  gtmContainerConfig: "a-valid-container-config",
  enablePreviewServer: true,
  useHttps: true,
  useManagedSsl: true,
  customDomain: "",
  enableCloudDns: false
};

describe("deploymentInputSchema", () => {
  it("accepts the default GCP MVP deployment input", () => {
    const result = deploymentInputSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  it("rejects non-GCP providers for the MVP", () => {
    const result = deploymentInputSchema.safeParse({ ...validInput, provider: "aws" });

    expect(result.success).toBe(false);
  });

  it("requires a positive max instance count", () => {
    const result = deploymentInputSchema.safeParse({ ...validInput, maxInstances: 0 });

    expect(result.success).toBe(false);
  });

  it("redacts the GTM container config in review output", () => {
    const parsed = deploymentInputSchema.parse(validInput);

    expect(sanitizeDeploymentInputForReview(parsed).gtmContainerConfig).toBe("[REDACTED]");
  });
});
