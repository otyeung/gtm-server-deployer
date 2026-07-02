import { StatusDashboard } from "@/components/status/status-dashboard";
import { Badge } from "@/components/ui/badge";

export default function StatusPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_55%),linear-gradient(180deg,#e2e8f0,transparent)]" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="mb-8 grid gap-6 rounded-[2rem] border border-slate-200 bg-white/85 p-8 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.55)] backdrop-blur lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <Badge>GCP MVP</Badge>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Status
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Track Terraform phase transitions, inspect live logs, review emitted outputs, and
              protect destroy behind an explicit confirmation step.
            </p>
          </div>
          <div className="rounded-[1.75rem] border border-slate-900 bg-slate-950 p-6 text-slate-100">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
              Operations view
            </p>
            <ol className="mt-4 space-y-4 text-sm leading-6 text-slate-300">
              <li>1. Poll status, logs, and outputs from the deployment APIs.</li>
              <li>2. Surface active phase and errors without leaving the control plane.</li>
              <li>3. Require explicit confirmation before destroy can be triggered.</li>
            </ol>
          </div>
        </section>

        <StatusDashboard />
      </div>
    </main>
  );
}
