"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "glow" | "slide";

export function AnimatedButton({
  children,
  variant = "primary",
  size = "md",
  onClick,
  disabled = false,
  className = "",
  href,
}: {
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  href?: string;
}) {
  const sizeClasses = {
    sm: "h-9 px-4 text-xs gap-1.5",
    md: "h-11 px-6 text-sm gap-2",
    lg: "h-13 px-8 text-base gap-2.5",
  };

  const variantClasses = {
    primary: "bg-primary text-primary-foreground hover:shadow-[0_0_24px_rgba(16,185,129,0.3)]",
    secondary: "bg-white/5 text-white/80 border border-white/10 hover:bg-white/10 hover:border-white/20",
    ghost: "text-white/50 hover:text-white/90 hover:bg-white/5",
    glow: "bg-primary text-primary-foreground shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_40px_rgba(16,185,129,0.4)]",
    slide: "bg-transparent text-white/80 border border-white/10 overflow-hidden relative",
  };

  const Component = href ? motion.a : motion.button;

  return (
    <Component
      href={href}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      whileHover={{ scale: disabled ? 1 : 1.02, y: disabled ? 0 : -1 }}
      whileTap={{ scale: disabled ? 1 : 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={`inline-flex items-center justify-center font-medium rounded-full transition-all duration-300 cursor-pointer select-none ${sizeClasses[size]} ${variantClasses[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : ""} ${className}`}
    >
      {variant === "slide" && (
        <motion.div
          className="absolute inset-0 bg-primary rounded-full"
          initial={{ x: "-100%" }}
          whileHover={{ x: "0%" }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        />
      )}
      <span className="relative z-10 flex items-center gap-inherit">{children}</span>
    </Component>
  );
}
