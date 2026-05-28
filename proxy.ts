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
const isRetiredRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/lesson(.*)",
  "/onboarding(.*)",
  "/admin(.*)",
]);

const isStudioRoute = createRouteMatcher(["/studio(.*)"]);
const isStudioLoginRoute = createRouteMatcher(["/studio/login"]);
const isLoginRoute = createRouteMatcher(["/login"]);

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

  // /login : déjà connecté → on file au dashboard /studio.
  if (isLoginRoute(request) && isAuth) {
    return nextjsMiddlewareRedirect(request, "/studio");
  }
});

export const config = {
  // Exclure les assets statiques + la route Convex Auth proxy /api/auth
  matcher: [
    "/((?!.+\\.[\\w]+$|_next).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
