import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// ============================================================================
// Amour Studios — Next.js 16 Proxy (ex-middleware)
// ----------------------------------------------------------------------------
// Next 16 a renommé `middleware.ts` en `proxy.ts`. Les helpers Convex Auth
// restent compatibles car ils exposent un NextMiddleware standard — on se
// contente de ré-exporter le handler sous le nom `proxy`.
//
// Règles :
//  - /dashboard, /admin, /onboarding : requièrent une session Convex Auth
//  - /login : redirige vers /dashboard si déjà connecté
//  - tout le reste est public (landing, /api/auth/*, assets)
// ============================================================================

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/onboarding(.*)",
  "/lesson(.*)",
]);

const isLoginRoute = createRouteMatcher(["/login"]);

export const proxy = convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const isAuth = await convexAuth.isAuthenticated();

  if (isProtectedRoute(request) && !isAuth) {
    return nextjsMiddlewareRedirect(request, "/login");
  }

  if (isLoginRoute(request) && isAuth) {
    return nextjsMiddlewareRedirect(request, "/dashboard");
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
