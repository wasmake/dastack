import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function buttonStyles({
  variant = "primary",
  size = "md",
}: Pick<ButtonProps, "variant" | "size"> = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    variant === "primary" &&
      "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
    variant === "secondary" &&
      "border-border-strong bg-surface-raised text-foreground hover:border-muted-foreground/60 hover:bg-muted",
    variant === "ghost" &&
      "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
    variant === "danger" &&
      "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
    size === "sm" && "h-9 px-3 text-xs",
    size === "md" && "h-10 px-4",
    size === "lg" && "h-11 px-5",
    size === "icon" && "size-10",
  );
}

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}
