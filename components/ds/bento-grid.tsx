import * as React from "react";
import { cn } from "@/lib/utils";

export function BentoGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ds-cascade grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6",
        className
      )}
    >
      {children}
    </div>
  );
}
