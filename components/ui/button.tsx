import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white shadow-[0_14px_30px_-18px_rgba(37,99,235,0.8)] hover:bg-blue-500",
  secondary:
    "border border-slate-700/70 bg-slate-900 text-slate-100 hover:border-blue-400/60 hover:text-white",
  ghost: "border border-slate-300 bg-white text-slate-900 hover:border-blue-300 hover:bg-slate-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
