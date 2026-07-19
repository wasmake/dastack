import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";

export const metadata: Metadata = { title: "Verify email" };
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const { email, token } = await searchParams;
  return (
    <AuthCard
      title="Verify your email"
      description="Confirm the address associated with your DaStack account."
    >
      <VerifyEmailForm email={email} token={token} />
    </AuthCard>
  );
}
