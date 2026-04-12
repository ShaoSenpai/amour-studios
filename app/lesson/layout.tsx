"use client";

import { SidebarProvider } from "@/components/layout/sidebar-provider";

export default function LessonLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarProvider>{children}</SidebarProvider>;
}
