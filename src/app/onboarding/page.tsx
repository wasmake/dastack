import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { OrganizationStep } from "@/components/onboarding/organization-step";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { requireAuthenticatedUser } from "@/server/authorization";

export const metadata: Metadata = {
  title: "Organization setup",
  robots: { index: false, follow: false },
};
export default async function OnboardingPage() {
  try {
    await requireAuthenticatedUser();
  } catch {
    redirect("/login?callbackUrl=/onboarding");
  }
  return (
    <main className="min-h-dvh bg-panel">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="flex min-h-10 items-center rounded-md px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Dashboard
            </Link>
            <ThemeSwitcher />
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-12 sm:px-6 sm:py-20 md:grid-cols-[0.7fr_1.3fr]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            Onboarding / Step 1
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            Create a workspace boundary.
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Organizations keep service ownership and configuration intentionally
            scoped. Existing organization state is checked before anything new
            is created.
          </p>
        </div>
        <OrganizationStep />
      </div>
    </main>
  );
}
