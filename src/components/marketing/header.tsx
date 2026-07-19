"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";

const navigation = [
  ["Features", "/features"],
  ["Pricing", "/pricing"],
  ["Security", "/security"],
  ["Docs", "/docs"],
] as const;

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/82 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Main navigation"
        >
          {navigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="flex h-10 items-center rounded-md px-3 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeSwitcher />
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/register">Start deploying</Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="pt-16">
              <nav
                className="flex flex-col gap-1"
                aria-label="Mobile navigation"
              >
                {navigation.map(([label, href]) => (
                  <SheetClose asChild key={href}>
                    <Link
                      href={href}
                      className="flex min-h-11 items-center rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {label}
                    </Link>
                  </SheetClose>
                ))}
                <div className="my-3 h-px bg-border" />
                <SheetClose asChild>
                  <Link
                    href="/login"
                    className="flex min-h-11 items-center rounded-md px-3 text-sm"
                  >
                    Log in
                  </Link>
                </SheetClose>
                <Button asChild className="mt-2 w-full">
                  <SheetClose asChild>
                    <Link href="/register">Start deploying</Link>
                  </SheetClose>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
