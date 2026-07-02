import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ProviderCardProps {
  name: string;
  status: string;
  description: string;
  href: string;
  featured?: boolean;
}

export function ProviderCard({
  description,
  featured = false,
  href,
  name,
  status,
}: ProviderCardProps) {
  return (
    <Link href={href} className="group block">
      <Card
        className={cn(
          "h-full border-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/70 hover:shadow-[0_26px_50px_-32px_rgba(37,99,235,0.45)]",
          featured && "border-slate-900 bg-slate-950 text-white",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={cn("text-lg font-semibold tracking-tight", featured && "text-white")}>
              {name}
            </p>
            <p
              className={cn(
                "mt-2 text-sm leading-6",
                featured ? "text-slate-300" : "text-slate-600",
              )}
            >
              {description}
            </p>
          </div>
          <Badge
            variant={featured ? "neutral" : "primary"}
            className={featured ? "border-slate-700 bg-slate-900 text-slate-200" : ""}
          >
            {status}
          </Badge>
        </div>
        <div
          className={cn(
            "mt-8 flex items-center justify-between border-t pt-4 text-sm font-semibold",
            featured ? "border-slate-800 text-slate-100" : "border-slate-200 text-slate-900",
          )}
        >
          <span>Open provider workspace</span>
          <span aria-hidden="true" className="transition group-hover:translate-x-1">
            →
          </span>
        </div>
      </Card>
    </Link>
  );
}
