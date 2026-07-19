"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type HealthResponse = { status?: string; timestamp?: string; version?: string };
type HealthPayload = HealthResponse | { data?: HealthResponse };

async function getHealth(): Promise<HealthResponse> {
  const response = await fetch("/api/health", { cache: "no-store" });
  const payload = (await response.json()) as HealthPayload;
  const health =
    "data" in payload ? (payload.data ?? {}) : (payload as HealthResponse);
  if (!response.ok && !health.status)
    throw new Error("Health endpoint unavailable");
  return health;
}

export function LiveStatus() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30_000,
  });
  const status = query.data?.status?.toLowerCase();
  const healthy =
    status === "ok" || status === "healthy" || status === "operational";

  return (
    <Card className="mx-auto max-w-3xl overflow-hidden">
      <div className="flex min-h-16 items-center justify-between gap-4 border-b px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Platform API</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reported directly by <code>/api/health</code>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh status"
          disabled={query.isFetching}
          onClick={() => query.refetch()}
        >
          <RefreshCw
            className={`size-4 ${query.isFetching ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </Button>
      </div>
      <div className="flex min-h-24 items-center justify-between gap-4 px-5 py-5">
        {query.isPending ? (
          <Skeleton className="h-7 w-32" />
        ) : query.isError ? (
          <Badge tone="warning">
            <span className="size-1.5 rounded-full bg-current" /> Status
            unavailable
          </Badge>
        ) : (
          <Badge tone={healthy ? "success" : "warning"}>
            <span className="size-1.5 rounded-full bg-current" />
            {query.data?.status ?? "Unknown"}
          </Badge>
        )}
        {query.data?.timestamp && (
          <span className="text-right font-mono text-[10px] text-muted-foreground">
            Reported {query.data.timestamp}
          </span>
        )}
      </div>
      {query.isError && (
        <div className="border-t bg-warning/5 px-5 py-3 text-xs leading-5 text-muted-foreground">
          DaStack could not retrieve the health endpoint. This is not a claim of
          an outage; current status cannot be verified.
        </div>
      )}
    </Card>
  );
}
