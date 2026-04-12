"use client";

import { useCallback, useRef } from "react";

export function use3DTilt() {
  const ref = useRef<HTMLDivElement>(null);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width / 2) / (r.width / 2);
    const dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    el.style.transform = `perspective(900px) rotateX(${dy * -4}deg) rotateY(${dx * 4}deg) translateZ(6px)`;
    el.style.boxShadow = `${-dx * 12}px ${-dy * 12}px 40px rgba(0,0,0,0.15), ${-dx * 3}px ${-dy * 3}px 10px rgba(0,0,0,0.08)`;
  }, []);

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
    el.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)";
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
