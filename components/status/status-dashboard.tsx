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

type DashboardSnapshot = {
  state: Partial<DeploymentState>;
  logs: string;
  outputs: TerraformOutputMap;
};

async function fetchSnapshot(): Promise<DashboardSnapshot> {
  const [statusResponse, logsResponse, outputsResponse] = await Promise.all([
    fetch("/api/status"),
    fetch("/api/logs"),
    fetch("/api/output")
  ]);

  const statusPayload = (await statusResponse.json()) as StatusPayload;
  const logsPayload = (await logsResponse.json()) as LogsPayload;
  const outputsPayload = (await outputsResponse.json()) as OutputsPayload;

  return {
    state: statusPayload.state,
    logs: logsPayload.logs,
    outputs: outputsPayload.outputs
  };
}

export function StatusDashboard() {
  const [state, setState] = useState<Partial<DeploymentState>>({ phase: "idle" });
  const [logs, setLogs] = useState("");
  const [outputs, setOutputs] = useState<TerraformOutputMap>({});

  async function refresh() {
    const snapshot = await fetchSnapshot();
    setState(snapshot.state);
    setLogs(snapshot.logs);
    setOutputs(snapshot.outputs);
  }

  useEffect(() => {
    let isActive = true;

    async function load() {
      const snapshot = await fetchSnapshot();
      if (!isActive) {
        return;
      }

      setState(snapshot.state);
      setLogs(snapshot.logs);
      setOutputs(snapshot.outputs);
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
                {state.error.message}
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
