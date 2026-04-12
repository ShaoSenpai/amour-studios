"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopControls } from "@/components/layout/top-controls";
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
      <Header />
      <TopControls />
      <div
        className={`pb-20 md:pb-0 transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
          collapsed ? "md:ml-[68px]" : "md:ml-[240px]"
        }`}
      >
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
