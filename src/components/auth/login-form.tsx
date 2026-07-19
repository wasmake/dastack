"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { FormMessage } from "@/components/auth/form-message";
import { SocialButtons } from "@/components/auth/social-buttons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  remember: z.boolean(),
});
type LoginValues = z.infer<typeof schema>;

export function LoginForm({
  githubEnabled,
  googleEnabled,
  callbackUrl,
}: {
  githubEnabled: boolean;
  googleEnabled: boolean;
  callbackUrl: string;
}) {
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [notice, setNotice] = useState<{
    tone: "success" | "danger";
    text: string;
  } | null>(null);
  const [magicPending, setMagicPending] = useState(false);
  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "", remember: true },
  });

  useEffect(() => {
    const rememberedEmail = window.localStorage.getItem("dastack-login-email");
    if (rememberedEmail) form.setValue("email", rememberedEmail);
  }, [form]);

  async function passwordLogin(values: LoginValues) {
    setNotice(null);
    try {
      if (values.remember)
        window.localStorage.setItem("dastack-login-email", values.email);
      else window.localStorage.removeItem("dastack-login-email");
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        remember: String(values.remember),
        redirect: false,
      });
      if (result?.error)
        setNotice({
          tone: "danger",
          text: "Sign-in was not successful. Check your details and try again.",
        });
      else window.location.assign(callbackUrl);
    } catch {
      setNotice({
        tone: "danger",
        text: "Sign-in is temporarily unavailable. Please try again.",
      });
    }
  }

  async function magicLogin() {
    const valid = await form.trigger("email");
    if (!valid) return;
    setMagicPending(true);
    setNotice(null);
    try {
      const result = await signIn("resend", {
        email: form.getValues("email"),
        redirect: false,
        redirectTo: callbackUrl,
      });
      if (result?.error)
        setNotice({
          tone: "danger",
          text: "The sign-in link could not be requested. Please try again.",
        });
      else
        setNotice({
          tone: "success",
          text: "If this email can receive a sign-in link, it will arrive shortly.",
        });
    } catch {
      setNotice({
        tone: "danger",
        text: "The sign-in link could not be requested. Please try again.",
      });
    } finally {
      setMagicPending(false);
    }
  }

  const { errors } = form.formState;
  return (
    <div className="space-y-5">
      <SocialButtons
        githubEnabled={githubEnabled}
        googleEnabled={googleEnabled}
        callbackUrl={callbackUrl}
      />
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with email
        <span className="h-px flex-1 bg-border" />
      </div>
      <div
        className="grid grid-cols-2 rounded-lg bg-muted p-1"
        role="tablist"
        aria-label="Email sign-in method"
      >
        {(["password", "magic"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => {
              setMode(item);
              setNotice(null);
            }}
            className="min-h-9 rounded-md px-3 text-xs font-medium text-muted-foreground aria-selected:bg-surface-raised aria-selected:text-foreground aria-selected:shadow-sm"
          >
            {item === "password" ? "Password" : "Magic link"}
          </button>
        ))}
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <form
        className="space-y-4"
        onSubmit={
          mode === "password"
            ? form.handleSubmit(passwordLogin)
            : (event) => {
                event.preventDefault();
                void magicLogin();
              }
        }
        noValidate
      >
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="mt-1.5"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...form.register("email")}
          />
          <FormMessage id="email-error" message={errors.email?.message} />
        </div>
        {mode === "password" && (
          <>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  className="text-xs text-primary hover:text-accent"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="mt-1.5"
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                {...form.register("password")}
              />
              <FormMessage
                id="password-error"
                message={errors.password?.message}
              />
            </div>
            <label className="flex min-h-8 items-center gap-2.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border-strong accent-primary"
                {...form.register("remember")}
              />
              Stay signed in for 30 days
            </label>
          </>
        )}
        <Button
          className="w-full"
          type="submit"
          disabled={form.formState.isSubmitting || magicPending}
        >
          {(form.formState.isSubmitting || magicPending) && (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          )}
          {mode === "password" ? "Log in" : "Email me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}
