import Link from "next/link";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-7 text-center sm:text-left">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
      {footer && (
        <div className="mt-6 text-center text-sm text-muted-foreground">
          {footer}
        </div>
      )}
      <p className="mt-8 text-center text-[11px] leading-5 text-muted-foreground">
        By continuing, you acknowledge the{" "}
        <Link
          className="underline underline-offset-4 hover:text-foreground"
          href="/terms"
        >
          Terms
        </Link>{" "}
        and{" "}
        <Link
          className="underline underline-offset-4 hover:text-foreground"
          href="/privacy"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
