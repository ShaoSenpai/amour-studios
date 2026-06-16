import type { NextConfig } from "next";

// CSP volontairement permissive : les exercices s'affichent en iframe via
// `exerciseUrl` (outils externes variés) → `frame-src *`. On garde 'unsafe-inline'
// /'unsafe-eval' pour ne pas casser Next/Convex/Stripe et le script de thème inline.
// assets.calendly.com : widget.js + widget.css + polices du widget inline d'onboarding
// (sinon le script est bloqué par script-src → Calendly ne s'affiche pas, cf. /onboarding).
// cdnjs.cloudflare.com : jsPDF chargé par les exos interactifs (public/exos/*) pour
// générer le PDF — sinon script bloqué → "ça bloque la génération". fonts.googleapis
// + fonts.gstatic : Google Fonts (Schibsted Grotesk + DM Mono) des exos.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://assets.calendly.com https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://assets.calendly.com https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https://assets.calendly.com https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "frame-src *",
  "media-src 'self' https: blob:",
].join("; ");

const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: CSP },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
