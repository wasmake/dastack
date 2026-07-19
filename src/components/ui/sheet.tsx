"use client";

import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "left" | "right";
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]" />
      <SheetPrimitive.Content
        className={cn(
          "fixed inset-y-0 z-50 w-[min(88vw,320px)] border bg-surface-raised p-4 shadow-2xl",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          className,
        )}
        {...props}
      >
        <SheetPrimitive.Title className="sr-only">
          Navigation
        </SheetPrimitive.Title>
        <SheetPrimitive.Description className="sr-only">
          Site navigation links
        </SheetPrimitive.Description>
        {children}
        <SheetPrimitive.Close
          aria-label="Close navigation"
          className="absolute right-3 top-3 grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
