import type { Metadata } from "next";
import { ProjectDetailView } from "@/components/projects/project-detail-view";

export const metadata: Metadata = {
  title: "Project",
  robots: { index: false, follow: false },
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ organization?: string | string[] }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const organizationId = Array.isArray(query.organization)
    ? query.organization[0]
    : query.organization;
  return (
    <ProjectDetailView projectId={projectId} organizationId={organizationId} />
  );
}
