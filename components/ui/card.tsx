import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-[0_22px_50px_-30px_rgba(15,23,42,0.45)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
