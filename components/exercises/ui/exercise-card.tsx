"use client";

import { use3DTilt } from "../hooks/use-3d-tilt";
import { ReactNode } from "react";

export function ExerciseCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { ref, onMouseMove, onMouseLeave } = use3DTilt();

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`group relative bg-[#1a1816] rounded-none p-8 sm:p-10 transition-all duration-300 overflow-hidden ${className}`}
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      <div className="absolute top-0 left-0 h-[3px] w-0 bg-primary transition-all duration-500 ease-[cubic-bezier(.22,.68,0,1.2)] group-hover:w-full" />
      {children}
    </div>
  );
}
