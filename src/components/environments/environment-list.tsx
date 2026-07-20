import { MapPin, Network } from "lucide-react";
import type { Environment } from "@/hooks/use-phase-two";
import { EnvironmentBadge } from "@/components/environments/environment-badge";
import { Card, CardContent } from "@/components/ui/card";

export function EnvironmentList({
  environments,
}: {
  environments: Environment[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {environments.map((environment) => (
        <Card key={environment.id}>
          <CardContent className="flex min-w-0 items-start gap-3 p-4 sm:p-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Network className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold">
                  {environment.name}
                </h3>
                <EnvironmentBadge
                  value={environment.status ?? environment.type}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="capitalize">{environment.type}</span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden="true" />{" "}
                  {environment.region}
                </span>
                {environment.networkId && (
                  <span className="font-mono">{environment.networkId}</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
