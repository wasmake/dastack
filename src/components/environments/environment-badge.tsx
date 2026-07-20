import { Badge } from "@/components/ui/badge";

function tone(value: string) {
  const normalized = value.toLowerCase();
  if (["online", "ready", "active", "production"].includes(normalized))
    return "success" as const;
  if (["offline", "failed", "error", "unhealthy"].includes(normalized))
    return "danger" as const;
  if (["staging", "pending", "degraded"].includes(normalized))
    return "warning" as const;
  return "neutral" as const;
}

export function EnvironmentBadge({ value }: { value: string }) {
  return (
    <Badge tone={tone(value)} className="capitalize">
      {value.replaceAll("_", " ")}
    </Badge>
  );
}
