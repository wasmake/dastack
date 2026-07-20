"use client";

import { ArrowRight, Boxes, FileCode2 } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { useServiceTemplates } from "@/hooks/use-phase-two";

export function CatalogView() {
  const templates = useServiceTemplates();
  const published = templates.data?.filter(
    (template) => template.publicationState === "published",
  );

  return (
    <div>
      <PageHeader
        eyebrow="Services"
        title="Service catalog"
        description="Published operator-maintained service templates available for deployment drafts."
      />
      {templates.isPending && <LoadingState label="Loading service catalog" />}
      {templates.isError && (
        <ErrorState
          message="Published service templates could not be loaded from the catalog API."
          retry={() => templates.refetch()}
        />
      )}
      {published?.length === 0 && (
        <EmptyState
          title="No published templates"
          description="The catalog is empty. An operator must import and publish service manifests before deployment drafts can be configured."
        />
      )}
      {published && published.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {published.map((template) => (
            <Card key={template.id} className="flex min-w-0 flex-col">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Boxes className="size-4" aria-hidden="true" />
                </span>
                <div className="flex flex-wrap justify-end gap-1.5">
                  <Badge>{template.manifest.category}</Badge>
                  <Badge>v{template.manifestVersion}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <h2 className="text-sm font-semibold">
                  {template.manifest.displayName}
                </h2>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-muted-foreground">
                  {template.manifest.description}
                </p>
                <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <FileCode2 className="size-3.5" aria-hidden="true" />{" "}
                    Published manifest
                  </span>
                  <Link
                    href={`/dashboard/services/catalog/${encodeURIComponent(template.id)}`}
                    className="inline-flex min-h-10 items-center gap-1.5 text-xs font-medium hover:text-primary"
                  >
                    Configure{" "}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
