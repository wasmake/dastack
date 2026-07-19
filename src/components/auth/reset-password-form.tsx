"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/auth/form-message";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z
  .object({
    password: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(128, "Password is too long")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/\d/, "Add a number")
      .regex(/[^A-Za-z0-9]/, "Add a symbol"),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token?: string }) {
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  async function submit(values: Values) {
    if (!token) return;
    setResult(null);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: values.password,
          passwordConfirmation: values.confirmPassword,
        }),
      });
      setResult(response.ok ? "success" : "error");
    } catch {
      setResult("error");
    }
  }

  if (!token)
    return (
      <Alert tone="danger">
        This reset link is incomplete or no longer valid. Request a new password
        reset link.
      </Alert>
    );
  if (result === "success")
    return (
      <div className="space-y-4">
        <Alert tone="success">Your password has been updated.</Alert>
        <Button asChild className="w-full">
          <Link href="/login">Continue to login</Link>
        </Button>
      </div>
    );

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      {result === "error" && (
        <Alert tone="danger">
          The password could not be reset. The link may have expired; request a
          new one and try again.
        </Alert>
      )}
      <div>
        <Label htmlFor="reset-password">New password</Label>
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          className="mt-1.5"
          aria-invalid={!!form.formState.errors.password}
          aria-describedby="reset-password-guidance"
          {...form.register("password")}
        />
        <p
          id="reset-password-guidance"
          className={`mt-1.5 text-xs ${form.formState.errors.password ? "text-danger" : "text-muted-foreground"}`}
        >
          {form.formState.errors.password?.message ??
            "12+ characters with uppercase, lowercase, number, and symbol"}
        </p>
      </div>
      <div>
        <Label htmlFor="reset-confirm">Confirm new password</Label>
        <Input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          className="mt-1.5"
          aria-invalid={!!form.formState.errors.confirmPassword}
          aria-describedby={
            form.formState.errors.confirmPassword
              ? "reset-confirm-error"
              : undefined
          }
          {...form.register("confirmPassword")}
        />
        <FormMessage
          id="reset-confirm-error"
          message={form.formState.errors.confirmPassword?.message}
        />
      </div>
      <Button
        className="w-full"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting && (
          <LoaderCircle className="size-4 animate-spin" />
        )}
        Update password
      </Button>
    </form>
  );
}
