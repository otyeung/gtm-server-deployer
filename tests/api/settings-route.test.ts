import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspacePaths } from "@/lib/deployment/paths";
import { DEFAULT_LOCAL_SETTINGS } from "@/lib/schemas/settings";

const originalCwd = process.cwd();

let rootDir: string;

describe("settings route", () => {
  beforeEach(async () => {
    vi.resetModules();
    rootDir = path.join(originalCwd, ".test-workspaces", `settings-route-${randomUUID()}`);
    await mkdir(rootDir, { recursive: true });
    process.chdir(rootDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(rootDir, { force: true, recursive: true });
  });

  it("returns defaults when the settings file is missing", async () => {
    const route = await import("@/app/api/settings/route");

    const response = await route.GET();

    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings: DEFAULT_LOCAL_SETTINGS });
  });

  it("persists validated settings", async () => {
    const route = await import("@/app/api/settings/route");
    const settings = {
      terraformPath: "/opt/bin/terraform",
      gcloudPath: "/opt/bin/gcloud",
      dockerPath: "/opt/bin/docker",
    };

    const response = await route.POST(
      new Request("http://localhost/api/settings", {
        method: "POST",
        headers: {
          origin: "http://localhost",
        },
        body: JSON.stringify(settings),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings });
    await expect(readFile(getWorkspacePaths(rootDir).settingsFile, "utf8")).resolves.toBe(
      `${JSON.stringify(settings, null, 2)}\n`,
    );
  });

  it("rejects empty binary paths", async () => {
    const route = await import("@/app/api/settings/route");

    const response = await route.POST(
      new Request("http://localhost/api/settings", {
        method: "POST",
        body: JSON.stringify({
          terraformPath: "",
          gcloudPath: "gcloud",
          dockerPath: "docker",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: expect.objectContaining({
          fieldErrors: expect.objectContaining({
            terraformPath: expect.any(Array),
          }),
        }),
      }),
    );
  });

  it("rejects cross-origin settings updates", async () => {
    const route = await import("@/app/api/settings/route");

    const response = await route.POST(
      new Request("http://localhost/api/settings", {
        method: "POST",
        headers: {
          referer: "https://evil.example/settings",
        },
        body: JSON.stringify({
          terraformPath: "/opt/bin/terraform",
          gcloudPath: "/opt/bin/gcloud",
          dockerPath: "/opt/bin/docker",
        }),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Cross-origin browser requests are not allowed.",
    });
  });

  it("returns a 400 response when the settings body is invalid JSON", async () => {
    const route = await import("@/app/api/settings/route");

    const response = await route.POST(
      new Request("http://localhost/api/settings", {
        method: "POST",
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Request body must be valid JSON.",
    });
  });

  it("returns a 500 response when the settings file is invalid", async () => {
    const route = await import("@/app/api/settings/route");
    const paths = getWorkspacePaths(rootDir);
    await mkdir(path.dirname(paths.settingsFile), { recursive: true });
    await writeFile(paths.settingsFile, "{not-json", "utf8");

    const response = await route.GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: expect.stringContaining("JSON"),
    });
  });
});
