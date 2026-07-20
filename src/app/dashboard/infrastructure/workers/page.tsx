import type { Metadata } from "next";
import { WorkerNodesView } from "@/components/infrastructure/worker-nodes-view";

export const metadata: Metadata = {
  title: "Worker Nodes",
  robots: { index: false, follow: false },
};

export default function WorkerNodesPage() {
  return <WorkerNodesView />;
}
