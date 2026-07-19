import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Alert({
  className,
  tone = "info",
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "info" | "success" | "danger" }) {
  const Icon =
    tone === "success" ? CircleCheck : tone === "danger" ? CircleAlert : Info;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-5",
        tone === "info" && "bg-muted/60 text-muted-foreground",
        tone === "success" && "border-success/25 bg-success/8 text-success",
        tone === "danger" && "border-danger/25 bg-danger/8 text-danger",
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
