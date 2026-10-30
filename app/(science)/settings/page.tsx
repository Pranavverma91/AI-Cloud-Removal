import { SettingsPage } from "@/components/science/catalog-pages";
import { backendURL } from "@/lib/science/server";
export default function Page() {
  return <SettingsPage personalMode={!backendURL()} />;
}
