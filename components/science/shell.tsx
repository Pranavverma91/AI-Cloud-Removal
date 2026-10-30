"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Globe,
  ScanLine,
  Layers,
  Database,
  FlaskConical,
  History,
  Settings,
  BookOpen,
  LogOut,
  Search,
  CloudOff,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Brand } from "./primitives";
import { api } from "@/lib/science/client";
const nav = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/cloud-removal", "AI Cloud Removal", CloudOff],
  ["/explorer", "Cloud analysis map", Globe],
  ["/history", "Analysis history", History],
  ["/settings", "Settings", Settings],
  ["/research", "Research", BookOpen],
] as const;
const imageTools = [
  ["/analysis/new", "New analysis", ScanLine],
  ["/reconstructions", "Reconstructions", Layers],
  ["/datasets", "Datasets", Database],
  ["/models", "Model registry", Layers],
  ["/models/lab", "Model laboratory", FlaskConical],
] as const;
export default function Shell({
  children,
  name,
  personalMode,
}: {
  children: React.ReactNode;
  name: string;
  personalMode: boolean;
}) {
  const pathname = usePathname(),
    router = useRouter();
  return (
    <div className="se-app">
      <SidebarProvider>
        <Sidebar className="se-sidebar">
          <SidebarHeader>
            <Brand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <p className="se-eyebrow">PERSONAL WORKSPACE</p>
              <SidebarMenu>
                {nav.map(([href, label, Icon]) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={pathname === href}>
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <details open={imageTools.some(([href]) => pathname === href)}>
                <summary className="se-eyebrow cursor-pointer px-2 py-3">
                  Image analysis tools
                </summary>
                <SidebarMenu>
                  {imageTools.map(([href, label, Icon]) => (
                    <SidebarMenuItem key={href}>
                      <SidebarMenuButton asChild isActive={pathname === href}>
                        <Link href={href}>
                          <Icon />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </details>
            </SidebarGroup>
            <div className="se-sidebar-note">
              <OrbitBadge />
              <p>
                Real observations.
                <br />
                Reproducible research.
              </p>
              <Link href="/workspace">Sentinel-2 workspace</Link>
            </div>
          </SidebarContent>
          <SidebarFooter>
            <span className="se-profile">
              {name}
              <small>{"Personal workspace"}</small>
            </span>
            {!personalMode && (
              <button
                onClick={async () => {
                  await api("/auth/logout", { method: "POST" });
                  window.location.href = "/";
                }}
              >
                <LogOut size={16} />
                Sign out
              </button>
            )}
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <header className="se-topbar">
            <SidebarTrigger />
            <span>
              Earth observation /{" "}
              <b>
                {[...nav, ...imageTools].find((n) => n[0] === pathname)?.[1] ||
                  "Analysis"}
              </b>
            </span>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q");
                router.push(
                  "/history?q=" + encodeURIComponent(String(q || "")),
                );
              }}
            >
              <Search size={16} />
              <input
                name="q"
                aria-label="Search analyses"
                placeholder="Search analyses…"
              />
            </form>
            <span className="se-badge">PERSONAL EDITION</span>
          </header>
          <main className="se-main">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
function OrbitBadge() {
  return <Globe size={28} />;
}
