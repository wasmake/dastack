import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create account" };
export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Set up your identity, then create an organization workspace."
      footer={
        <>
          Already have an account?{" "}
          <Link
            className="font-medium text-primary hover:text-accent"
            href="/login"
          >
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
