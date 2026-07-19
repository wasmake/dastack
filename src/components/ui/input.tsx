import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-border-strong bg-background px-3 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)] transition",
        "placeholder:text-muted-foreground/65 hover:border-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15",
        "disabled:cursor-not-allowed disabled:opacity-55 aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15",
        className,
      )}
      {...props}
    />
  );
}
