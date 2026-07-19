import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvitation } from "@/components/onboarding/accept-invitation";
import { requireAuthenticatedUser } from "@/server/authorization";

export const metadata: Metadata = {
  title: "Accept invitation",
  robots: { index: false, follow: false },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/dashboard");
  try {
    await requireAuthenticatedUser();
  } catch {
    const callbackUrl = `/invitations/accept?token=${encodeURIComponent(token)}`;
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }
  return (
    <AuthCard
      title="Organization invitation"
      description="Review and accept this one-time invitation."
    >
      <AcceptInvitation token={token} />
    </AuthCard>
  );
}
