"use client";

import { useCallback } from "react";

export function useAutoResize() {
  const handleResize = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  return handleResize;
}
