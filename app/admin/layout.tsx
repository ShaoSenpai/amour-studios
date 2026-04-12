"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Topbar } from "@/components/ds/topbar";
import { SidebarProvider, useSidebar } from "@/components/layout/sidebar-provider";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminShell>{children}</AdminShell>
    </SidebarProvider>
  );
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div
        className={`pb-20 md:pb-0 transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
          collapsed ? "md:ml-[68px]" : "md:ml-[240px]"
        }`}
      >
        <Topbar />
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
