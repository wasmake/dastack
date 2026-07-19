"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/auth/form-message";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({ email: z.email("Enter a valid email address") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function submit(values: Values) {
    setResult(null);
    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setResult(response.ok ? "success" : "error");
    } catch {
      setResult("error");
    }
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      {result === "success" && (
        <Alert tone="success">
          If an account can be recovered with that address, reset instructions
          will arrive shortly.
        </Alert>
      )}
      {result === "error" && (
        <Alert tone="danger">
          The recovery request could not be completed. Please try again later.
        </Alert>
      )}
      <div>
        <Label htmlFor="recovery-email">Email address</Label>
        <Input
          id="recovery-email"
          type="email"
          autoComplete="email"
          className="mt-1.5"
          aria-invalid={!!form.formState.errors.email}
          aria-describedby={
            form.formState.errors.email ? "recovery-error" : undefined
          }
          {...form.register("email")}
        />
        <FormMessage
          id="recovery-error"
          message={form.formState.errors.email?.message}
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
        Send reset instructions
      </Button>
    </form>
  );
}
