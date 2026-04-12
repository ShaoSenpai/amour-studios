"use client";

import { motion } from "framer-motion";
import { useState, useId } from "react";

export function AnimatedInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  const hasValue = value.length > 0;
  const isActive = focused || hasValue;

  return (
    <div className="relative">
      <motion.label
        htmlFor={id}
        className="absolute left-4 pointer-events-none text-white/30 origin-left"
        animate={{
          y: isActive ? -24 : 0,
          scale: isActive ? 0.75 : 1,
          color: focused ? "rgba(16,185,129,0.8)" : "rgba(255,255,255,0.3)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {label}
      </motion.label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? placeholder : undefined}
        disabled={disabled}
        className="w-full h-12 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 pt-2 text-sm text-white/90 outline-none transition-all duration-300 focus:border-primary/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.1)] disabled:opacity-40 placeholder:text-white/15"
      />
      {/* Bottom accent line */}
      <motion.div
        className="absolute bottom-0 left-1/2 h-[2px] bg-primary rounded-full"
        initial={{ width: 0, x: "-50%" }}
        animate={{ width: focused ? "90%" : "0%", x: "-50%" }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}

export function AnimatedTextarea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const id = useId();
  const hasValue = value.length > 0;
  const isActive = focused || hasValue;

  return (
    <div className="relative">
      <motion.label
        htmlFor={id}
        className="absolute left-4 top-3 pointer-events-none text-white/30 origin-left"
        animate={{
          y: isActive ? -20 : 0,
          scale: isActive ? 0.75 : 1,
          color: focused ? "rgba(16,185,129,0.8)" : "rgba(255,255,255,0.3)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
      >
        {label}
      </motion.label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={focused ? placeholder : undefined}
        rows={rows}
        disabled={disabled}
        className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 pt-6 pb-3 text-sm text-white/90 outline-none transition-all duration-300 resize-none focus:border-primary/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(16,185,129,0.1)] disabled:opacity-40 placeholder:text-white/15"
      />
      <motion.div
        className="absolute bottom-0 left-1/2 h-[2px] bg-primary rounded-full"
        initial={{ width: 0, x: "-50%" }}
        animate={{ width: focused ? "90%" : "0%", x: "-50%" }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  );
}
