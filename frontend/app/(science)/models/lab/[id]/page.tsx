import { Laboratory } from "@/components/science/catalog-pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Laboratory id={id} />;
}
