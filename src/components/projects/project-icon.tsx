import { Box, Boxes, Database, Globe2, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";

const icons = {
  box: Box,
  boxes: Boxes,
  database: Database,
  globe: Globe2,
  layers: Layers3,
};

export const projectIconOptions = Object.keys(icons) as Array<
  keyof typeof icons
>;

export function ProjectIcon({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  const Icon = icons[icon as keyof typeof icons] ?? Box;
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/50 text-primary",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}
