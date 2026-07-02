"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DeploymentState, TerraformOutputMap } from "@/lib/deployment/types";
import { DestroyDialog } from "./destroy-dialog";
import { OutputsCard } from "./outputs-card";
import { TerraformConsole } from "./terraform-console";

type StatusPayload = { state: Partial<DeploymentState> };
type LogsPayload = { logs: string };
type OutputsPayload = { outputs: TerraformOutputMap };
type ErrorPayload = { error?: unknown };

type DashboardSnapshot = {
  state: Partial<DeploymentState>;
  logs: string;
  outputs: TerraformOutputMap;
  errors: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseError(response: Response, payload: unknown): string {
  if (isObject(payload) && typeof (payload as ErrorPayload).error === "string") {
    return (payload as ErrorPayload).error as string;
  }

  return `Request failed with status ${response.status}.`;
}

function isStatusPayload(payload: unknown): payload is StatusPayload {
  return isObject(payload) && isObject(payload.state);
}

function isLogsPayload(payload: unknown): payload is LogsPayload {
  return isObject(payload) && typeof payload.logs === "string";
}

function isOutputsPayload(payload: unknown): payload is OutputsPayload {
  return isObject(payload) && isObject(payload.outputs);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchSegment<T>({
  endpoint,
  fallback,
  validate,
  select
}: {
  endpoint: string;
  fallback: T;
  validate: (payload: unknown) => payload is { [key: string]: T };
  select: (payload: { [key: string]: T }) => T;
}): Promise<{ value: T; error: string | null }> {
  try {
    const response = await fetch(endpoint);
    const payload = await readJson(response);

    if (!response.ok) {
      return {
        value: fallback,
        error: `${endpoint}: ${getResponseError(response, payload)}`
      };
    }

    if (!validate(payload)) {
      return {
        value: fallback,
        error: `${endpoint}: Response payload was invalid.`
      };
    }

    return { value: select(payload), error: null };
  } catch (error) {
    return {
      value: fallback,
      error: `${endpoint}: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function fetchSnapshot(previous: Omit<DashboardSnapshot, "errors">): Promise<DashboardSnapshot> {
  const [statusResult, logsResult, outputsResult] = await Promise.all([
    fetchSegment({
      endpoint: "/api/status",
      fallback: previous.state,
      validate: isStatusPayload,
      select: (payload) => payload.state
    }),
    fetchSegment({
      endpoint: "/api/logs",
      fallback: previous.logs,
      validate: isLogsPayload,
      select: (payload) => payload.logs
    }),
    fetchSegment({
      endpoint: "/api/output",
      fallback: previous.outputs,
      validate: isOutputsPayload,
      select: (payload) => payload.outputs
    })
  ]);

  return {
    state: statusResult.value,
    logs: logsResult.value,
    outputs: outputsResult.value,
    errors: [statusResult.error, logsResult.error, outputsResult.error].filter(
      (error): error is string => error !== null,
    )
  };
}

export function StatusDashboard() {
  const [state, setState] = useState<Partial<DeploymentState>>({ phase: "idle" });
  const [logs, setLogs] = useState("");
  const [outputs, setOutputs] = useState<TerraformOutputMap>({});
  const [errors, setErrors] = useState<string[]>([]);

  async function refresh() {
    const snapshot = await fetchSnapshot({ state, logs, outputs });
    setState(snapshot.state);
    setLogs(snapshot.logs);
    setOutputs(snapshot.outputs);
    setErrors(snapshot.errors);
  }

  useEffect(() => {
    let isActive = true;

    async function load() {
      const snapshot = await fetchSnapshot({
        state: { phase: "idle" },
        logs: "",
        outputs: {}
      });
      if (!isActive) {
        return;
      }

      setState(snapshot.state);
      setLogs(snapshot.logs);
      setOutputs(snapshot.outputs);
      setErrors(snapshot.errors);
    }

    void load();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
      <div className="space-y-6">
        <Card className="overflow-hidden border-slate-900 bg-white p-0">
          <div className="bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9)_58%,rgba(30,64,175,0.78))] px-6 py-6 text-white">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-blue-300/30 bg-blue-400/10 text-blue-100">Live state</Badge>
              <Badge className="border-slate-700 bg-slate-900/80 text-slate-200" variant="neutral">
                Terraform execution
              </Badge>
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Deployment status</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Observe the current deployment phase, investigate logs, inspect outputs, or trigger a controlled destroy.
            </p>
          </div>
          <div className="grid gap-4 p-6 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Current phase</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{state.phase ?? "idle"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Active operation</p>
              <p className="mt-2 text-lg font-semibold text-slate-950">{state.activeOperation ?? "idle"}</p>
            </div>
            {state.error ? (
              <div className="md:col-span-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <p className="font-medium">{state.error.message}</p>
                {state.error.remediation ? (
                  <p className="mt-2">{state.error.remediation}</p>
                ) : null}
                {state.error.logExcerpt ? (
                  <pre className="mt-3 overflow-x-auto rounded-xl border border-red-200 bg-red-100/70 p-3 font-mono text-xs leading-5 text-red-900 whitespace-pre-wrap">
                    {state.error.logExcerpt}
                  </pre>
                ) : null}
              </div>
            ) : null}
            {errors.length > 0 ? (
              <div
                className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                role="alert"
              >
                <p className="font-semibold">
                  Status dashboard could not be refreshed. Check the deployment APIs, then try again.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <OutputsCard outputs={outputs} />
        <DestroyDialog onDestroyed={refresh} />
      </div>

      <TerraformConsole logs={logs} />
    </div>
  );
}
