import Link from "next/link";

const providers = [
  { name: "Google Cloud", status: "Available in MVP", href: "/deploy" },
  { name: "Azure", status: "Documented future provider", href: "#roadmap" },
  { name: "AWS", status: "Documented future provider", href: "#roadmap" },
  { name: "Generic Terraform", status: "Documented future provider", href: "#roadmap" }
];

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-16">
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-700">
            Local-first Terraform automation
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Deploy GTM Server-Side tagging infrastructure from your machine
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            A portfolio-grade control plane for Google Tag Manager Server-Side deployments on
            Google Cloud Run, Secret Manager, and optional managed HTTPS infrastructure.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/deploy"
              className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Deploy to GCP
            </Link>
            <Link
              href="https://github.com/otyeung/gtm-server-deployer"
              className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold"
            >
              GitHub
            </Link>
          </div>
        </div>
        <div className="rounded-3xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Deployment flow</h2>
          <ol className="mt-4 space-y-3 text-sm text-slate-600">
            <li>1. Validate project and container settings</li>
            <li>2. Generate Terraform variables locally</li>
            <li>3. Run init and plan for review</li>
            <li>4. Confirm apply and inspect outputs</li>
          </ol>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {providers.map((provider) => (
          <Link key={provider.name} href={provider.href} className="rounded-2xl border bg-white p-5">
            <h2 className="font-semibold">{provider.name}</h2>
            <p className="mt-2 text-sm text-slate-600">{provider.status}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
