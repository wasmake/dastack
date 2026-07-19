import Link from "next/link";
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid size-7 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10",
        className,
      )}
    >
      <span className="absolute left-[6px] top-[6px] size-[5px] rounded-[1px] bg-primary" />
      <span className="absolute right-[6px] top-[6px] size-[5px] rounded-[1px] bg-primary/65" />
      <span className="absolute bottom-[6px] left-[6px] h-[5px] w-[14px] rounded-[1px] bg-primary" />
    </span>
  );
}

export function Logo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href="/"
      aria-label="DaStack home"
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-md font-semibold tracking-tight",
        className,
      )}
    >
      <Mark />
      {!compact && <span className="text-[15px]">DaStack</span>}
    </Link>
  );
}
