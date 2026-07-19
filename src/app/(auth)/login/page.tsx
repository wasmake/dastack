import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Log in" };
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const requestedCallback = (await searchParams).callbackUrl;
  const callbackUrl =
    requestedCallback?.startsWith("/") && !requestedCallback.startsWith("//")
      ? requestedCallback
      : "/dashboard";
  return (
    <AuthCard
      title="Welcome back"
      description="Log in to manage your organizations and services."
      footer={
        <>
          New to DaStack?{" "}
          <Link
            className="font-medium text-primary hover:text-accent"
            href="/register"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm
        githubEnabled={Boolean(
          process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
        )}
        googleEnabled={Boolean(
          process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
        )}
        callbackUrl={callbackUrl}
      />
    </AuthCard>
  );
}
