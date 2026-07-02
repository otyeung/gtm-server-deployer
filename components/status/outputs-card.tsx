import { Card } from "@/components/ui/card";
import type { TerraformOutputMap } from "@/lib/deployment/types";

export function OutputsCard({ outputs }: { outputs: TerraformOutputMap }) {
  const entries = Object.entries(outputs);

  return (
    <Card className="border-slate-200 bg-white/90">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Runtime data</p>
      <h2 className="mt-2 text-lg font-semibold text-slate-950">Outputs</h2>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Terraform outputs will appear here after plan or apply completes.</p>
      ) : (
        <dl className="mt-4 space-y-4 text-sm">
          {entries.map(([name, output]) => (
            <div key={name} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <dt className="font-semibold text-slate-600">{name}</dt>
              <dd className="mt-1 break-words text-slate-950">{String(output.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
