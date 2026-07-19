import Link from "next/link";
import { Logo } from "@/components/logo";

const groups = [
  {
    title: "Product",
    links: [
      ["Features", "/features"],
      ["Pricing", "/pricing"],
      ["Security", "/security"],
      ["Status", "/status"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Documentation", "/docs"],
      ["Dashboard", "/dashboard"],
      ["Create account", "/register"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
    ],
  },
] as const;

export function MarketingFooter() {
  return (
    <footer className="border-t bg-panel">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_2fr] lg:px-8">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
            A focused control plane for shipping and operating Docker workloads.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {groups.map((group) => (
            <div key={group.title}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                {group.title}
              </h2>
              <ul className="mt-3 space-y-1">
                {group.links.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      className="inline-flex min-h-9 items-center text-sm text-muted-foreground hover:text-foreground"
                      href={href}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t px-4 py-5 text-center text-xs text-muted-foreground">
        (c) {new Date().getFullYear()} DaStack. Built for containers.
      </div>
    </footer>
  );
}
