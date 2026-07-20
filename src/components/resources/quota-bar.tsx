import { cn } from "@/lib/utils";

function formatValue(value: number, unit?: string): string {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)}${unit ? ` ${unit}` : ""}`;
}

export function ResourceUsageMeter({
  label,
  used,
  limit,
  unit,
  className,
}: {
  label: string;
  used: number;
  limit: number;
  unit?: string;
  className?: string;
}) {
  const percentage = limit > 0 ? (used / limit) * 100 : used > 0 ? 100 : 0;
  const width = Math.min(Math.max(percentage, 0), 100);
  const tone =
    percentage >= 100
      ? "bg-danger"
      : percentage >= 80
        ? "bg-warning"
        : "bg-primary";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatValue(used, unit)} / {formatValue(limit, unit)}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label} usage`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(Math.max(used, 0), Math.max(limit, 0))}
      >
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

export const QuotaBar = ResourceUsageMeter;
