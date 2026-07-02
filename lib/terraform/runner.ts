import "server-only";

import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { redactSensitiveText } from "@/lib/deployment/redaction";

export type TerraformCommand = "init" | "plan" | "apply" | "output" | "destroy";

export type SpawnLike = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export type TerraformCommandOptions = {
  binaryPath: string;
  command: TerraformCommand;
  args: readonly string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  sensitiveValues: readonly string[];
  onLog?: (chunk: string) => void | Promise<void>;
  spawnImpl?: SpawnLike;
};

export type TerraformCommandResult = {
  command: TerraformCommand;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runTerraformCommand(
  options: TerraformCommandOptions,
): Promise<TerraformCommandResult> {
  const spawnImpl = options.spawnImpl ?? spawn;
  const child = spawnImpl(options.binaryPath, [options.command, ...options.args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    shell: false
  });

  let stdout = "";
  let stderr = "";
  const logWrites: Promise<void>[] = [];

  const append = (chunk: Buffer, target: "stdout" | "stderr") => {
    const text = redactSensitiveText(chunk.toString("utf8"), options.sensitiveValues);

    if (target === "stdout") {
      stdout += text;
    } else {
      stderr += text;
    }

    if (options.onLog) {
      logWrites.push(Promise.resolve(options.onLog(text)));
    }
  };

  child.stdout.on("data", (chunk: Buffer) => {
    append(chunk, "stdout");
  });

  child.stderr.on("data", (chunk: Buffer) => {
    append(chunk, "stderr");
  });

  return new Promise((resolve, reject) => {
    child.on("error", (error) => reject(error));
    child.on("close", (exitCode) => {
      void Promise.all(logWrites)
        .then(() => {
          const result = {
            command: options.command,
            exitCode: exitCode ?? 1,
            stdout,
            stderr
          };

          if (result.exitCode === 0) {
            resolve(result);
            return;
          }

          reject(new Error(`Terraform ${options.command} failed with exit code ${result.exitCode}`));
        })
        .catch(reject);
    });
  });
}
