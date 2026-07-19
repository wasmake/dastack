import { Boxes, ShieldCheck, Terminal } from "lucide-react";
import { Logo } from "@/components/logo";
import { ThemeSwitcher } from "@/components/theme-switcher";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(340px,0.8fr)_1.2fr]">
      <aside className="relative hidden overflow-hidden border-r bg-[#080b0c] p-10 text-[#e8f0ed] lg:flex lg:flex-col">
        <div
          className="page-grid absolute inset-0 opacity-60"
          aria-hidden="true"
        />
        <div
          className="absolute -left-32 top-1/4 size-96 rounded-full bg-emerald-400/10 blur-[100px]"
          aria-hidden="true"
        />
        <Logo className="relative z-10 text-white" />
        <div className="relative z-10 my-auto max-w-sm">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-emerald-400">
            Docker cloud control plane
          </p>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.045em]">
            Infrastructure workflows without infrastructure noise.
          </h1>
          <div className="mt-9 space-y-4 text-sm text-white/55">
            <div className="flex items-center gap-3">
              <Boxes className="size-4 text-emerald-400" aria-hidden="true" />{" "}
              Container-first delivery
            </div>
            <div className="flex items-center gap-3">
              <Terminal
                className="size-4 text-emerald-400"
                aria-hidden="true"
              />{" "}
              Focused operational context
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck
                className="size-4 text-emerald-400"
                aria-hidden="true"
              />{" "}
              Clear workspace boundaries
            </div>
          </div>
        </div>
        <p className="relative z-10 text-xs text-white/35">
          DaStack control plane
        </p>
      </aside>
      <section className="relative flex min-h-dvh items-center justify-center px-4 py-16 sm:px-6">
        <div className="absolute right-4 top-3 sm:right-6">
          <ThemeSwitcher />
        </div>
        <div className="absolute left-4 top-3 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-[420px]">{children}</div>
      </section>
    </main>
  );
}
