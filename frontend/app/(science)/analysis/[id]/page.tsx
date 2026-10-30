import Workstation from "@/components/science/workstation";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Workstation id={id} />;
}
