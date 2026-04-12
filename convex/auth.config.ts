// ============================================================================
// Amour Studios — Convex Auth JWKS config
// ----------------------------------------------------------------------------
// Déclare Convex comme un provider OIDC valide pour les tokens JWT émis
// par @convex-dev/auth. CONVEX_SITE_URL est auto-set par Convex (= NEXT_PUBLIC_CONVEX_SITE_URL).
// ============================================================================

const authConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
