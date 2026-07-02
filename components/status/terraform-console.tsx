import { Card } from "@/components/ui/card";

export function TerraformConsole({ logs }: { logs: string }) {
  return (
    <Card className="overflow-hidden border-slate-900 bg-slate-950 p-0 text-slate-100 shadow-[0_30px_80px_-48px_rgba(15,23,42,0.95)]">
      <div className="border-b border-slate-800 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">Execution log</p>
        <h2 className="mt-2 text-lg font-semibold text-white">Terraform console</h2>
      </div>
      <pre className="max-h-[32rem] overflow-auto px-5 py-4 text-sm leading-6 text-slate-200">
        {logs || "No logs yet."}
      </pre>
    </Card>
  );
}
