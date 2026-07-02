import { Card } from "@/components/ui/card";
import type { DeploymentReview } from "@/lib/schemas/deployment";

const reviewFields: Array<{ key: keyof DeploymentReview; label: string }> = [
  { key: "provider", label: "Provider" },
  { key: "projectId", label: "GCP project ID" },
  { key: "region", label: "Region" },
  { key: "environment", label: "Environment" },
  { key: "containerImage", label: "Container image" },
  { key: "cpu", label: "vCPU" },
  { key: "memory", label: "Memory" },
  { key: "minInstances", label: "Minimum instances" },
  { key: "maxInstances", label: "Maximum instances" },
  { key: "enablePreviewServer", label: "Preview server" },
  { key: "useHttps", label: "HTTPS" },
  { key: "useManagedSsl", label: "Managed SSL" },
  { key: "customDomain", label: "Custom domain" },
  { key: "enableCloudDns", label: "Cloud DNS automation" },
  { key: "gtmContainerConfig", label: "GTM container config" },
];

function formatReviewValue(value: DeploymentReview[keyof DeploymentReview]) {
  if (typeof value === "boolean") {
    return value ? "Enabled" : "Disabled";
  }

  if (value === "") {
    return "Not set";
  }

  return String(value);
}

export function ReviewSummary({ review }: { review: DeploymentReview }) {
  return (
    <Card className="border-slate-900 bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Review</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Deployment summary</h2>
        </div>
        <div className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">
          Sensitive data masked
        </div>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        {reviewFields.map(({ key, label }) => (
          <div key={key} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {label}
            </dt>
            <dd className="mt-2 break-words text-sm font-medium text-slate-100">
              {formatReviewValue(review[key])}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
