"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

export function AnimatedCard({
  children,
  className = "",
  hover = true,
  gradient = false,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  gradient?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={hover ? { y: -2, scale: 1.005 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`relative rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm overflow-hidden transition-shadow duration-300 ${
        hover ? "hover:shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:border-white/[0.1] cursor-pointer" : ""
      } ${className}`}
    >
      {gradient && (
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
          <div className="absolute inset-[1px] rounded-2xl bg-gradient-to-br from-primary/10 via-transparent to-amber-500/5" />
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

export function ShimmerCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`}>
      {/* Gradient border */}
      <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-primary/30 via-white/5 to-amber-500/20">
        <div className="h-full w-full rounded-2xl bg-[#0c0b09]" />
      </div>
      {/* Shimmer effect */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent -translate-x-full animate-[shimmer-slide_3s_ease-in-out_infinite]" />
      </div>
      <div className="relative z-10 p-6">{children}</div>
    </div>
  );
}
