import Link from "next/link";
import { ProviderCard } from "@/components/home/provider-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const providers = [
  {
    name: "Google Cloud",
    status: "Available in MVP",
    description: "Cloud Run, Secret Manager, HTTPS, and optional Cloud DNS for GTM server-side tagging.",
    href: "/deploy",
    featured: true
  },
  {
    name: "Azure",
    status: "Future provider",
    description: "Documented path for translating the same control plane contract to Azure-native resources.",
    href: "#roadmap"
  },
  {
    name: "AWS",
    status: "Future provider",
    description: "Reserved for an ECS or App Runner based deploy path using the same review/apply workflow.",
    href: "#roadmap"
  },
  {
    name: "Generic Terraform",
    status: "Future provider",
    description: "A provider-agnostic workspace for teams that already own the target infrastructure baseline.",
    href: "#roadmap"
  }
];

export default function HomePage() {
  const roadmapItems = [
    "Working AWS deployment",
    "Working Azure deployment",
    "Generic Terraform template export",
    "Google Cloud Shell launch button",
    "Multi-region deployment",
    "GitHub Actions CI/CD"
  ];

  return (
    <main className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.2),transparent_52%),linear-gradient(180deg,#0f172a_0%,#e2e8f0_68%,#f8fafc_100%)]" />
      <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-16 sm:px-6 lg:px-8">
        <section className="grid gap-8 rounded-[2rem] border border-slate-800 bg-slate-950 px-6 py-8 text-white shadow-[0_40px_120px_-70px_rgba(15,23,42,0.9)] lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:px-10 lg:py-10">
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="border-blue-300/25 bg-blue-400/10 text-blue-100">
                Local-first Terraform automation
              </Badge>
              <Badge className="border-slate-700 bg-slate-900 text-slate-200" variant="neutral">
                Industrial control plane
              </Badge>
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Deploy GTM Server-Side tagging infrastructure from your machine
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-300">
              A portfolio-grade control plane for Google Tag Manager Server-Side deployments on
              Google Cloud Run, Secret Manager, and optional managed HTTPS infrastructure.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/deploy"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.8)] transition hover:bg-blue-500"
              >
                Deploy to GCP
              </Link>
              <Link
                href="https://github.com/otyeung/gtm-server-deployer"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm font-semibold text-slate-100 transition hover:border-blue-400/60 hover:text-white"
              >
                GitHub
              </Link>
            </div>
          </div>
          <Card className="border-slate-800 bg-slate-900/85 text-white shadow-none">
            <h2 className="text-lg font-semibold">Deployment flow</h2>
            <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-300">
              <li>1. Validate project and container settings.</li>
              <li>2. Generate Terraform variables locally.</li>
              <li>3. Run init and plan for review.</li>
              <li>4. Confirm apply and inspect outputs.</li>
            </ol>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {providers.map((provider) => (
            <ProviderCard key={provider.name} {...provider} />
          ))}
        </section>

        <section
          id="roadmap"
          aria-labelledby="roadmap-heading"
          className="rounded-[2rem] border border-slate-200/80 bg-white/90 p-6 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.25)] backdrop-blur sm:p-8"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Badge>Roadmap</Badge>
              <h2 id="roadmap-heading" className="text-2xl font-semibold tracking-tight text-slate-950">
                Planned providers and next steps
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-slate-600">
                The GCP MVP is ready in the local control plane today. AWS, Azure, and generic Terraform
                flows stay visible so the future provider contract is easy to understand before those
                implementations land.
              </p>
            </div>
            <Link href="/deploy" className="text-sm font-semibold text-blue-700 transition hover:text-blue-600">
              Explore the active GCP deploy flow →
            </Link>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {roadmapItems.map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
