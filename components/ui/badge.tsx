import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "primary" | "neutral";

const variantClasses: Record<BadgeVariant, string> = {
  primary: "border border-blue-200 bg-blue-50 text-blue-700",
  neutral: "border border-slate-200 bg-slate-50 text-slate-600",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "primary", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
