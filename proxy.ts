import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// ============================================================================
// Amour Studios — Next.js 16 Proxy (ex-middleware)
// ----------------------------------------------------------------------------
// Le produit, c'est le dashboard /studio (back-office coach). La partie
// formation (/dashboard, /lesson, /onboarding) est mise de côté : on la masque
// en redirigeant tout vers /studio. Idem l'ancien /admin.
//
// Règles :
//  - /dashboard, /lesson, /onboarding, /admin → /studio (formation masquée)
//  - /studio(.*) : requiert une session ; /studio/login reste public
//  - /login : si déjà connecté → /studio
//  - tout le reste est public (/api/auth/*, assets)
// ============================================================================

// Formation mise de côté + ancien back-office → tout vers /studio.
// (NB : /onboarding(.*) reste PUBLIC — c'est le nouveau parcours client
// post-paiement, pas l'ancienne route formation.)
const isRetiredRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/lesson(.*)",
  "/admin(.*)",
]);

const isStudioRoute = createRouteMatcher(["/studio(.*)"]);
const isStudioLoginRoute = createRouteMatcher(["/studio/login"]);
const isLoginRoute = createRouteMatcher(["/login"]);
// Espace élève : exercices coaching. Auth requise (n'importe quel membre).
// Le gating par tier/module est fait côté serveur (lib/access).
const isStudentRoute = createRouteMatcher(["/exos(.*)"]);

export const proxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuth = await convexAuth.isAuthenticated();

  // Formation / ancien admin → /studio (plus rien ne pointe dessus).
  if (isRetiredRoute(request)) {
    return nextjsMiddlewareRedirect(request, "/studio");
  }

  // /studio/login : public si non connecté, sinon → /studio.
  if (isStudioLoginRoute(request)) {
    if (isAuth) return nextjsMiddlewareRedirect(request, "/studio");
    return;
  }

  // /studio (hors login) protégé → page de login du studio si non connecté.
  if (isStudioRoute(request) && !isAuth) {
    return nextjsMiddlewareRedirect(request, "/studio/login");
  }

  // /exos (espace élève) : auth requise (membre OK). Redirige vers /login si
  // non connecté. Le gating tier/module est appliqué côté serveur.
  if (isStudentRoute(request) && !isAuth) {
    return nextjsMiddlewareRedirect(request, "/login");
  }

  // /login : déjà connecté → honore returnTo si chemin interne, sinon racine
  // (dispatcher selon le rôle : admin /studio, membre /exos).
  if (isLoginRoute(request) && isAuth) {
    const rt = request.nextUrl.searchParams.get("returnTo");
    const dest = rt && rt.startsWith("/") && !rt.startsWith("//") ? rt : "/";
    return nextjsMiddlewareRedirect(request, dest);
  }
});

export const config = {
  // Exclure les assets statiques + la route Convex Auth proxy /api/auth
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
    // ⚠️ Sécurité contenu : les fichiers d'exo (`/exos/**/*.html` + `_bridge.js`)
    // ont une extension → sinon EXCLUS par le pattern ci-dessus et servis en
    // statique SANS auth (n'importe qui avec l'URL ouvrait le contenu coaching).
    // On les fait entrer dans le matcher pour que la règle `isStudentRoute`
    // (auth requise) s'applique aussi aux fichiers, pas seulement à la page.
    "/exos/:path*",
  ],
};
