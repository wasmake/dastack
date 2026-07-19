import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Reset password" };
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account email to request secure reset instructions."
      footer={
        <Link
          className="font-medium text-primary hover:text-accent"
          href="/login"
        >
          Return to login
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
