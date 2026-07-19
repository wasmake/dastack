import { AlertTriangle, Box, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-surface/40 px-6 py-12 text-center">
      <div className="mb-4 grid size-10 place-items-center rounded-lg border bg-muted/50 text-muted-foreground">
        <Box className="size-4" aria-hidden="true" />
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-danger/20 bg-danger/5 p-6 text-center">
      <AlertTriangle className="mb-3 size-5 text-danger" aria-hidden="true" />
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {retry && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-4"
          onClick={retry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
