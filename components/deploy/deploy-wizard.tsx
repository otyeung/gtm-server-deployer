"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ReviewSummary } from "@/components/deploy/review-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deploymentInputSchema,
  sanitizeDeploymentInputForReview,
  type DeploymentInput,
  type DeploymentReview
} from "@/lib/schemas/deployment";

const defaults: DeploymentInput = {
  provider: "gcp",
  projectId: "gtm-server-deployer",
  region: "asia-southeast1",
  environment: "dev",
  containerImage: "gcr.io/cloud-tagging-10302018/gtm-cloud-image:stable",
  cpu: "1",
  memory: "512Mi",
  minInstances: 0,
  maxInstances: 3,
  gtmContainerConfig: "",
  enablePreviewServer: true,
  useHttps: true,
  useManagedSsl: true,
  customDomain: "",
  enableCloudDns: false
};

type DeploymentFormInput = z.input<typeof deploymentInputSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-2 text-sm text-red-600">{message}</p>;
}

async function parseResponse(response: Response) {
  try {
    return (await response.json()) as { error?: string; state?: { phase?: string } };
  } catch {
    return {};
  }
}

export function DeployWizard() {
  const [review, setReview] = useState<DeploymentReview | null>(null);
  const [planSucceeded, setPlanSucceeded] = useState(false);
  const [message, setMessage] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const form = useForm<DeploymentFormInput, undefined, DeploymentInput>({
    resolver: zodResolver(deploymentInputSchema),
    defaultValues: defaults
  });

  const {
    formState: { errors, isSubmitting },
    register
  } = form;

  async function plan(values: DeploymentInput) {
    setReview(sanitizeDeploymentInputForReview(values));
    setPlanSucceeded(false);
    setMessage("Running Terraform plan…");

    const response = await fetch("/api/deploy/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values)
    });
    const payload = await parseResponse(response);

    if (!response.ok) {
      setMessage(payload.error ?? "Terraform plan failed. Review the status page for details.");
      return;
    }

    setPlanSucceeded(true);
    setMessage(
      payload.state?.phase === "planned"
        ? "Terraform plan succeeded. Confirm Apply is now available."
        : "Plan completed. Confirm Apply is now available."
    );
  }

  async function apply() {
    if (!planSucceeded) {
      return;
    }

    setIsApplying(true);
    const response = await fetch("/api/deploy/apply", { method: "POST" });
    const payload = await parseResponse(response);
    setMessage(
      response.ok
        ? "Apply started. Open Status for live logs."
        : payload.error ?? "Apply failed to start."
    );
    setIsApplying(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
      <Card className="overflow-hidden border-slate-900 bg-white p-0">
        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(15,23,42,0.86)_55%,rgba(30,64,175,0.82))] px-6 py-6 text-white">
          <div className="flex flex-wrap items-center gap-3">
            <Badge className="border-blue-300/30 bg-blue-400/10 text-blue-100">Task 9 / Deploy</Badge>
            <Badge className="border-slate-700 bg-slate-900/80 text-slate-200" variant="neutral">
              Local Terraform plan/apply
            </Badge>
          </div>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">GCP control plane input</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
            Validate the deployment payload, generate a redacted review, then gate apply behind a
            successful Terraform plan.
          </p>
        </div>

        <form className="space-y-8 p-6" onSubmit={form.handleSubmit(plan)}>
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Core deployment settings</p>
                <p className="text-sm text-slate-500">Project, runtime profile, and scaling envelope.</p>
              </div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Provider: GCP</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="projectId">GCP project ID</Label>
                <Input
                  id="projectId"
                  {...register("projectId")}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <FieldError message={errors.projectId?.message} />
              </div>
              <div>
                <Label htmlFor="region">Region</Label>
                <Input id="region" {...register("region")} onFocus={(event) => event.currentTarget.select()} />
                <FieldError message={errors.region?.message} />
              </div>
              <div>
                <Label htmlFor="environment">Environment</Label>
                <Select id="environment" {...register("environment")}>
                  <option value="dev">dev</option>
                  <option value="prod">prod</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="containerImage">Container image</Label>
                <Input
                  id="containerImage"
                  {...register("containerImage")}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <FieldError message={errors.containerImage?.message} />
              </div>
              <div>
                <Label htmlFor="cpu">vCPU</Label>
                <Select id="cpu" {...register("cpu")}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="memory">Memory</Label>
                <Select id="memory" {...register("memory")}>
                  <option value="512Mi">512Mi</option>
                  <option value="1Gi">1Gi</option>
                  <option value="2Gi">2Gi</option>
                  <option value="4Gi">4Gi</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="minInstances">Minimum instances</Label>
                <Input
                  id="minInstances"
                  type="number"
                  {...register("minInstances", { valueAsNumber: true })}
                />
                <FieldError message={errors.minInstances?.message} />
              </div>
              <div>
                <Label htmlFor="maxInstances">Maximum instances</Label>
                <Input
                  id="maxInstances"
                  type="number"
                  {...register("maxInstances", { valueAsNumber: true })}
                />
                <FieldError message={errors.maxInstances?.message} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Container bootstrap</p>
              <p className="text-sm text-slate-500">
                Paste the GTM server container configuration. Review mode will redact it automatically.
              </p>
            </div>
            <div>
              <Label htmlFor="gtmContainerConfig">GTM container config</Label>
              <Textarea
                id="gtmContainerConfig"
                placeholder="Paste the exported GTM server container config JSON or script block"
                {...register("gtmContainerConfig")}
              />
              <FieldError message={errors.gtmContainerConfig?.message} />
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Traffic and domain options</p>
              <p className="text-sm text-slate-500">
                Tune HTTPS posture, preview server, and DNS automation for the deployment target.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="customDomain">Custom domain</Label>
                <Input
                  id="customDomain"
                  placeholder="gtm.example.com"
                  {...register("customDomain")}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <FieldError message={errors.customDomain?.message} />
              </div>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Checkbox {...register("enablePreviewServer")} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Enable preview server</span>
                  <span className="block text-sm text-slate-500">Keeps the preview endpoint reachable.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Checkbox {...register("useHttps")} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Force HTTPS</span>
                  <span className="block text-sm text-slate-500">Serve the tagging endpoint over TLS.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Checkbox {...register("useManagedSsl")} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Use managed SSL</span>
                  <span className="block text-sm text-slate-500">Provision Google-managed certificates when possible.</span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Checkbox {...register("enableCloudDns")} />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Enable Cloud DNS</span>
                  <span className="block text-sm text-slate-500">Requires a custom domain to automate records.</span>
                </span>
              </label>
            </div>
            <FieldError message={errors.enableCloudDns?.message} />
          </section>

          <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Planning…" : "Review and Plan"}
            </Button>
            <Button
              type="button"
              disabled={!planSucceeded || isApplying}
              onClick={() => {
                void apply();
              }}
              variant="secondary"
            >
              {isApplying ? "Applying…" : "Confirm Apply"}
            </Button>
          </div>

          {message ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {message}
            </p>
          ) : null}
        </form>
      </Card>

      {review ? (
        <ReviewSummary review={review} />
      ) : (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Review queue</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">No plan generated yet</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Complete the deployment form to generate a redacted review payload before the local
            Terraform plan executes.
          </p>
        </Card>
      )}
    </div>
  );
}
