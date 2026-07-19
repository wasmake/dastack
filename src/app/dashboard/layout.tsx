import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { requireAuthenticatedUser } from "@/server/authorization";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireAuthenticatedUser();
  } catch {
    redirect("/login?callbackUrl=/dashboard");
  }
  return <AppShell>{children}</AppShell>;
}
