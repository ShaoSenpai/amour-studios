"use client";

import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";
import { SAFE, type C } from "./glass";

// Bottom-sheet sur mobile, modale centrée sur desktop. Ferme sur Échap + clic fond.
export function MobileSheet({
  c,
  dark,
  isMobile,
  onClose,
  title,
  children,
  footer,
  maxWidth = 460,
}: {
  c: C;
  dark: boolean;
  isMobile: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const panelBg = dark ? "rgba(20,20,26,0.98)" : "rgba(255,253,250,0.98)";

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: panelBg,
          backdropFilter: "blur(40px) saturate(150%)",
          WebkitBackdropFilter: "blur(40px) saturate(150%)",
          border: `1px solid ${c.line}`,
          color: c.text,
          width: isMobile ? "100%" : "min(" + maxWidth + "px, calc(100vw - 48px))",
          maxHeight: isMobile ? "calc(100vh - 40px)" : "calc(100vh - 48px)",
          borderRadius: isMobile ? "22px 22px 0 0" : 20,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
        }}
      >
        {(title || isMobile) && (
          <div style={{ flexShrink: 0, padding: isMobile ? "10px 18px 12px" : "18px 22px 12px", borderBottom: `1px solid ${c.hairline}` }}>
            {isMobile && <div style={{ width: 40, height: 4, borderRadius: 4, background: c.line, margin: "0 auto 10px" }} />}
            {title && <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>}
          </div>
        )}
        <div style={{ overflowY: "auto", padding: isMobile ? 18 : 22, flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ flexShrink: 0, padding: isMobile ? `12px 18px calc(12px + ${SAFE.bottom})` : "14px 22px", borderTop: `1px solid ${c.hairline}`, display: "flex", gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
