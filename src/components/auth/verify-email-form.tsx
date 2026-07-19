"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, MailCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/auth/form-message";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({ email: z.email("Enter a valid email address") });
type Values = z.infer<typeof schema>;

export function VerifyEmailForm({
  email,
  token,
}: {
  email?: string;
  token?: string;
}) {
  const [result, setResult] = useState<"sent" | "verified" | "error" | null>(
    null,
  );
  const [verifying, setVerifying] = useState(Boolean(token));
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: email ?? "" },
  });

  useEffect(() => {
    if (!token) return;
    let active = true;
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: "GET",
    })
      .then((response) => {
        if (!active) return;
        setResult(response.ok ? "verified" : "error");
        window.history.replaceState(
          null,
          "",
          response.ok
            ? "/verify-email?status=verified"
            : "/verify-email?status=invalid",
        );
      })
      .catch(() => {
        if (active) setResult("error");
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function resend(values: Values) {
    setResult(null);
    try {
      const response = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setResult(response.ok ? "sent" : "error");
    } catch {
      setResult("error");
    }
  }

  if (result === "verified")
    return (
      <div className="space-y-4">
        <Alert tone="success">Your email address has been verified.</Alert>
        <Button asChild className="w-full">
          <Link href="/login">Continue to login</Link>
        </Button>
      </div>
    );

  return (
    <div className="space-y-5">
      <div className="grid size-11 place-items-center rounded-lg border bg-muted/40 text-primary">
        <MailCheck className="size-5" aria-hidden="true" />
      </div>
      {result === "sent" && (
        <Alert tone="success">
          If the address is eligible, a new verification email will arrive
          shortly.
        </Alert>
      )}
      {result === "error" && (
        <Alert tone="danger">
          The request could not be completed. The link may have expired; please
          try again.
        </Alert>
      )}
      {token && result !== "error" && (
        <Button className="w-full" type="button" disabled>
          {verifying && <LoaderCircle className="size-4 animate-spin" />}
          Verifying email address
        </Button>
      )}
      <form
        className="space-y-4 border-t pt-5"
        onSubmit={form.handleSubmit(resend)}
        noValidate
      >
        <div>
          <Label htmlFor="verify-email">Need another verification email?</Label>
          <Input
            id="verify-email"
            type="email"
            autoComplete="email"
            className="mt-1.5"
            aria-invalid={!!form.formState.errors.email}
            aria-describedby={
              form.formState.errors.email ? "verify-email-error" : undefined
            }
            {...form.register("email")}
          />
          <FormMessage
            id="verify-email-error"
            message={form.formState.errors.email?.message}
          />
        </div>
        <Button
          variant="secondary"
          className="w-full"
          type="submit"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting && (
            <LoaderCircle className="size-4 animate-spin" />
          )}
          Resend verification email
        </Button>
      </form>
    </div>
  );
}
