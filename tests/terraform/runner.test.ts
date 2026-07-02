import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runTerraformCommand, type SpawnLike } from "@/lib/terraform/runner";

function fakeSpawn(exitCode: number): SpawnLike {
  return vi.fn(() => {
    const child = new EventEmitter() as ReturnType<SpawnLike>;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();

    queueMicrotask(() => {
      child.stdout.write("ok secret-config");
      child.stdout.end();
      child.stderr.end();
      child.emit("close", exitCode);
    });

    return child;
  }) as SpawnLike;
}

describe("runTerraformCommand", () => {
  it("returns redacted output when Terraform succeeds", async () => {
    const result = await runTerraformCommand({
      binaryPath: "terraform",
      command: "plan",
      args: ["-no-color"],
      cwd: process.cwd(),
      sensitiveValues: ["secret-config"],
      spawnImpl: fakeSpawn(0)
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[REDACTED]");
  });

  it("rejects when Terraform exits with a non-zero status", async () => {
    await expect(
      runTerraformCommand({
        binaryPath: "terraform",
        command: "apply",
        args: ["-no-color"],
        cwd: process.cwd(),
        sensitiveValues: [],
        spawnImpl: fakeSpawn(1)
      }),
    ).rejects.toThrow("Terraform apply failed with exit code 1");
  });
});
