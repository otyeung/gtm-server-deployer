import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 shadow-sm transition",
        "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20",
        className,
      )}
      {...props}
    />
  );
}
