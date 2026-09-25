import Home from "../page";

export default async function AttentionPage({ searchParams }: { searchParams: Promise<{ project?: string; auditPage?: string }> }) {
  const search = await searchParams;
  return <Home searchParams={Promise.resolve({ attention: "all", project: search.project, auditPage: search.auditPage })} />;
}
