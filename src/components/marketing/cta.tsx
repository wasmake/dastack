import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Cta() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-xl border bg-surface p-7 sm:p-12">
        <div
          className="absolute -right-28 -top-40 size-96 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col justify-between gap-8 md:flex-row md:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">
              Ready when you are
            </p>
            <h2 className="mt-3 max-w-xl text-balance text-3xl font-semibold tracking-[-0.035em]">
              Move from container to running service, without building a
              platform team.
            </h2>
          </div>
          <Button asChild size="lg">
            <Link href="/register">
              Create an account{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
