import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runTerraformCommand, type SpawnLike } from "@/lib/terraform/runner";

function fakeSpawn(exitCode: number, stdoutChunks: readonly string[] = ["ok secret-config"]): SpawnLike {
  return vi.fn(() => {
    const child = new EventEmitter() as ReturnType<SpawnLike>;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();

    queueMicrotask(() => {
      stdoutChunks.forEach((chunk) => {
        child.stdout.write(chunk);
      });
      child.stdout.end();
      child.stderr.end();
      child.emit("close", exitCode);
    });

    return child;
  }) as SpawnLike;
}

describe("runTerraformCommand", () => {
  it("returns redacted output when Terraform succeeds", async () => {
    const onLog = vi.fn();
    const result = await runTerraformCommand({
      binaryPath: "terraform",
      command: "plan",
      args: ["-no-color"],
      cwd: process.cwd(),
      sensitiveValues: ["secret-config"],
      onLog,
      spawnImpl: fakeSpawn(0)
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("[REDACTED]");
    expect(onLog).toHaveBeenCalledWith("ok [REDACTED]");
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

  it("does not fail a successful command when onLog throws or rejects", async () => {
    const result = await runTerraformCommand({
      binaryPath: "terraform",
      command: "plan",
      args: ["-no-color"],
      cwd: process.cwd(),
      sensitiveValues: [],
      onLog: vi
        .fn<Parameters<NonNullable<Parameters<typeof runTerraformCommand>[0]["onLog"]>>, ReturnType<NonNullable<Parameters<typeof runTerraformCommand>[0]["onLog"]>>>()
        .mockImplementationOnce(() => {
          throw new Error("sync log failure");
        })
        .mockImplementationOnce(async () => Promise.reject(new Error("async log failure"))),
      spawnImpl: fakeSpawn(0, ["first chunk", " second chunk"])
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("first chunk second chunk");
    expect(result.logCallbackErrors).toHaveLength(2);
    expect(result.logCallbackErrors.map((error) => error.message)).toEqual([
      "sync log failure",
      "async log failure"
    ]);
  });

  it("redacts secrets split across stdout chunks in both result output and log callbacks", async () => {
    const onLog = vi.fn();
    const result = await runTerraformCommand({
      binaryPath: "terraform",
      command: "plan",
      args: ["-no-color"],
      cwd: process.cwd(),
      sensitiveValues: ["secret-config"],
      onLog,
      spawnImpl: fakeSpawn(0, ["prefix secret-", "config suffix"])
    });

    expect(result.stdout).toBe("prefix [REDACTED] suffix");
    expect(result.stdout).not.toContain("secret-config");
    const loggedOutput = onLog.mock.calls.map(([chunk]) => chunk).join("");
    expect(loggedOutput).toBe("prefix [REDACTED] suffix");
    expect(loggedOutput).not.toContain("secret-config");
  });
});
