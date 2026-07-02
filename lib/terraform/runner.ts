import "server-only";

import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { REDACTION_MARKER } from "@/lib/deployment/redaction";

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
  logCallbackErrors: Error[];
};

type TerraformCommandErrorOptions = Pick<TerraformCommandResult, "command" | "exitCode" | "stdout" | "stderr">;

function buildLogExcerpt(stdout: string, stderr: string): string {
  const combined = [stderr, stdout]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("\n");

  if (combined.length <= 500) {
    return combined;
  }

  return `${combined.slice(0, 497)}...`;
}

export class TerraformCommandError extends Error {
  readonly command: TerraformCommand;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly logExcerpt: string;

  constructor({ command, exitCode, stdout, stderr }: TerraformCommandErrorOptions) {
    const logExcerpt = buildLogExcerpt(stdout, stderr);
    super(
      logExcerpt.length > 0
        ? `Terraform ${command} failed with exit code ${exitCode}: ${logExcerpt}`
        : `Terraform ${command} failed with exit code ${exitCode}`,
    );
    this.name = "TerraformCommandError";
    this.command = command;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.logExcerpt = logExcerpt;
  }
}

class StreamingSensitiveRedactor {
  private readonly sensitiveValues: readonly string[];
  private readonly minBufferedLength: number;
  private pending = "";

  constructor(sensitiveValues: readonly string[]) {
    this.sensitiveValues = [...sensitiveValues]
      .filter((value) => value.length > 0)
      .sort((left, right) => right.length - left.length);
    this.minBufferedLength = Math.max(0, ...this.sensitiveValues.map((value) => value.length - 1));
  }

  push(chunk: string): string {
    if (this.sensitiveValues.length === 0) {
      return chunk;
    }

    this.pending += chunk;
    return this.drain(false);
  }

  flush(): string {
    if (this.sensitiveValues.length === 0) {
      return "";
    }

    return this.drain(true);
  }

  private drain(flushAll: boolean): string {
    const output: string[] = [];
    const minLength = flushAll ? 0 : this.minBufferedLength;

    while (this.pending.length > minLength) {
      const matchedValue = this.sensitiveValues.find((value) => this.pending.startsWith(value));

      if (matchedValue) {
        output.push(REDACTION_MARKER);
        this.pending = this.pending.slice(matchedValue.length);
        continue;
      }

      output.push(this.pending[0] ?? "");
      this.pending = this.pending.slice(1);
    }

    return output.join("");
  }
}

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
  const logCallbackErrors: Error[] = [];
  const logWrites: Promise<void>[] = [];
  const stdoutRedactor = new StreamingSensitiveRedactor(options.sensitiveValues);
  const stderrRedactor = new StreamingSensitiveRedactor(options.sensitiveValues);

  const recordLogWrite = (text: string) => {
    if (!options.onLog || text.length === 0) {
      return;
    }

    try {
      logWrites.push(
        Promise.resolve(options.onLog(text)).catch((error: unknown) => {
          logCallbackErrors.push(error instanceof Error ? error : new Error(String(error)));
        }),
      );
    } catch (error) {
      logCallbackErrors.push(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const append = (chunk: Buffer, target: "stdout" | "stderr") => {
    const redactor = target === "stdout" ? stdoutRedactor : stderrRedactor;
    const text = redactor.push(chunk.toString("utf8"));

    if (target === "stdout") {
      stdout += text;
    } else {
      stderr += text;
    }

    recordLogWrite(text);
  };

  const flush = (target: "stdout" | "stderr") => {
    const redactor = target === "stdout" ? stdoutRedactor : stderrRedactor;
    const text = redactor.flush();

    if (target === "stdout") {
      stdout += text;
    } else {
      stderr += text;
    }

    recordLogWrite(text);
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
      flush("stdout");
      flush("stderr");

      void Promise.all(logWrites)
        .then(() => {
          const result = {
            command: options.command,
            exitCode: exitCode ?? 1,
            stdout,
            stderr,
            logCallbackErrors
          };

          if (result.exitCode === 0) {
            resolve(result);
            return;
          }

          reject(new TerraformCommandError(result));
        });
    });
  });
}
