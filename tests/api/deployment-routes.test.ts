import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeploymentEngine } from "@/lib/deployment/engine";
import type { DeploymentState, TerraformOutputMap } from "@/lib/deployment/types";

vi.mock("server-only", () => ({}));

const { engine } = vi.hoisted(() => ({
  engine: {
    plan: vi.fn(),
    apply: vi.fn(),
    destroy: vi.fn(),
    getStatus: vi.fn(),
    getLogs: vi.fn(),
    getOutputs: vi.fn()
  } satisfies DeploymentEngine
}));

vi.mock("@/lib/deployment/engine-instance", () => ({
  getDeploymentEngine: () => engine
}));

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
  gtmContainerConfig: "secret-config",
  enablePreviewServer: true,
  useHttps: true,
  useManagedSsl: true,
  customDomain: "",
  enableCloudDns: false
} as const;

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

const outputs: TerraformOutputMap = {
  service_url: {
    sensitive: false,
    type: "string",
    value: "https://example.com"
  }
};

describe("deployment API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("plans a deployment", async () => {
    vi.mocked(engine.plan).mockResolvedValue(state);
    const route = await import("@/app/api/deploy/plan/route");

    const response = await route.POST(
      new Request("http://localhost/api/deploy/plan", {
        method: "POST",
        body: JSON.stringify(validInput)
      })
    );

    expect(route.runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state });
    expect(engine.plan).toHaveBeenCalledWith(validInput);
  });

  it("returns a 400 response when plan input is invalid", async () => {
    const route = await import("@/app/api/deploy/plan/route");

    const response = await route.POST(
      new Request("http://localhost/api/deploy/plan", {
        method: "POST",
        body: JSON.stringify({ ...validInput, projectId: "bad" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          fieldErrors: expect.objectContaining({
            projectId: expect.arrayContaining(["Project ID must be at least 6 characters"])
          })
        })
      })
    );
    expect(engine.plan).not.toHaveBeenCalled();
  });

  it("returns a 400 response when the plan body is invalid JSON", async () => {
    const route = await import("@/app/api/deploy/plan/route");

    const response = await route.POST(
      new Request("http://localhost/api/deploy/plan", {
        method: "POST",
        body: "{not-json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON."
    });
    expect(engine.plan).not.toHaveBeenCalled();
  });

  it("returns a 500 response when planning fails unexpectedly", async () => {
    vi.mocked(engine.plan).mockRejectedValue(new Error("plan exploded"));
    const route = await import("@/app/api/deploy/plan/route");

    const response = await route.POST(
      new Request("http://localhost/api/deploy/plan", {
        method: "POST",
        body: JSON.stringify(validInput)
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "plan exploded" });
  });

  it("applies a deployment", async () => {
    vi.mocked(engine.apply).mockResolvedValue(state);
    const route = await import("@/app/api/deploy/apply/route");

    const response = await route.POST();

    expect(route.runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state });
    expect(engine.apply).toHaveBeenCalledTimes(1);
  });

  it("destroys a deployment", async () => {
    vi.mocked(engine.destroy).mockResolvedValue({ ...state, phase: "destroyed" });
    const route = await import("@/app/api/destroy/route");

    const response = await route.POST();

    expect(route.runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state: { ...state, phase: "destroyed" } });
    expect(engine.destroy).toHaveBeenCalledTimes(1);
  });

  it("returns current status", async () => {
    vi.mocked(engine.getStatus).mockResolvedValue(state);
    const route = await import("@/app/api/status/route");

    const response = await route.GET();

    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state });
    expect(engine.getStatus).toHaveBeenCalledTimes(1);
  });

  it("returns deployment logs", async () => {
    vi.mocked(engine.getLogs).mockResolvedValue("planned\napplied");
    const route = await import("@/app/api/logs/route");

    const response = await route.GET();

    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ logs: "planned\napplied" });
    expect(engine.getLogs).toHaveBeenCalledTimes(1);
  });

  it("returns Terraform outputs", async () => {
    vi.mocked(engine.getOutputs).mockResolvedValue(outputs);
    const route = await import("@/app/api/output/route");

    const response = await route.GET();

    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outputs });
    expect(engine.getOutputs).toHaveBeenCalledTimes(1);
  });

  it("redacts sensitive Terraform outputs", async () => {
    vi.mocked(engine.getOutputs).mockResolvedValue({
      service_url: {
        sensitive: false,
        type: "string",
        value: "https://example.com"
      },
      admin_token: {
        sensitive: true,
        type: "string",
        value: "secret-token"
      }
    });
    const route = await import("@/app/api/output/route");

    const response = await route.GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      outputs: {
        service_url: {
          sensitive: false,
          type: "string",
          value: "https://example.com"
        },
        admin_token: {
          sensitive: true,
          type: "string",
          value: "[REDACTED]"
        }
      }
    });
  });
});
