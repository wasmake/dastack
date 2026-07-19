"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
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
    name: z
      .string()
      .trim()
      .min(2, "Enter your full name")
      .max(100, "Name is too long"),
    email: z.email("Enter a valid email address"),
    password: z
      .string()
      .min(12, "Use at least 12 characters")
      .max(128, "Password is too long")
      .regex(/[a-z]/, "Add a lowercase letter")
      .regex(/[A-Z]/, "Add an uppercase letter")
      .regex(/\d/, "Add a number")
      .regex(/[^A-Za-z0-9]/, "Add a symbol"),
    confirmPassword: z.string(),
    terms: z.literal(true, { error: "You must agree to the terms" }),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
type RegisterValues = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState(false);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      terms: false as true,
    },
  });
  const errors = form.formState.errors;

  async function submit(values: RegisterValues) {
    setError(false);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          email: values.email,
          password: values.password,
          passwordConfirmation: values.confirmPassword,
          termsAccepted: values.terms,
        }),
      });
      if (!response.ok) {
        setError(true);
        return;
      }
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
    } catch {
      setError(true);
    }
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(submit)} noValidate>
      {error && (
        <Alert tone="danger">
          Account creation was not successful. Review your details or try again
          later.
        </Alert>
      )}
      <div>
        <Label htmlFor="name">Full name</Label>
        <Input
          id="name"
          autoComplete="name"
          className="mt-1.5"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "name-error" : undefined}
          {...form.register("name")}
        />
        <FormMessage id="name-error" message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="register-email">Email address</Label>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          className="mt-1.5"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "register-email-error" : undefined}
          {...form.register("email")}
        />
        <FormMessage
          id="register-email-error"
          message={errors.email?.message}
        />
      </div>
      <div>
        <Label htmlFor="new-password">Password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className="mt-1.5"
          aria-invalid={!!errors.password}
          aria-describedby="password-guidance"
          {...form.register("password")}
        />
        <p
          id="password-guidance"
          className={
            errors.password
              ? "mt-1.5 text-xs text-danger"
              : "mt-1.5 text-xs text-muted-foreground"
          }
        >
          {errors.password?.message ??
            "12+ characters with uppercase, lowercase, number, and symbol"}
        </p>
      </div>
      <div>
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          className="mt-1.5"
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={
            errors.confirmPassword ? "confirm-error" : undefined
          }
          {...form.register("confirmPassword")}
        />
        <FormMessage
          id="confirm-error"
          message={errors.confirmPassword?.message}
        />
      </div>
      <div>
        <label
          htmlFor="terms"
          className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground"
        >
          <input
            id="terms"
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 rounded border-border-strong accent-primary"
            aria-invalid={!!errors.terms}
            aria-describedby={errors.terms ? "terms-error" : undefined}
            {...form.register("terms")}
          />
          I agree to the DaStack Terms of Service and Privacy Policy.
        </label>
        <FormMessage id="terms-error" message={errors.terms?.message} />
      </div>
      <Button
        className="w-full"
        type="submit"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting && (
          <LoaderCircle className="size-4 animate-spin" />
        )}
        Create account
      </Button>
    </form>
  );
}
