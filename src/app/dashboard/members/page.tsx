import type { Metadata } from "next";
import { MembersView } from "@/components/dashboard/members-view";

export const metadata: Metadata = {
  title: "Members",
  robots: { index: false, follow: false },
};

export default function MembersPage() {
  return <MembersView />;
}
