import { canSeeConsolidated } from "@/lib/auth/company-access";
import type { RoleKey } from "@/lib/auth/roles";
import type { SessionUserSnapshot } from "@/lib/auth/session";

type PostLoginRoute = {
  route: string;
  activeCompanyId: string | null;
};

const roleLandingMap: Record<RoleKey, string> = {
  OWNER: "/admin/dashboard",
  ADMIN: "/admin/dashboard",
  AUDITOR: "/admin/dashboard",
  CAJERO: "/admin/pos",
  VENDEDOR: "/admin/pos",
  ALMACEN: "/admin/inventory",
  COMPRAS: "/admin/purchases",
  TECNICO_RECARGA: "/admin/cylinders",
  DISTRIBUIDOR: "/distributor",
};

const currentlyAvailableRoutes = new Set([
  "/auth/session",
  "/auth/forbidden",
]);

function normalizeReturnTo(returnTo: string | null | undefined) {
  if (!returnTo) {
    return null;
  }

  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) {
    return null;
  }

  if (returnTo.startsWith("/auth/login") || returnTo.startsWith("/auth/logout")) {
    return null;
  }

  return returnTo;
}

function isRouteCurrentlyAvailable(route: string) {
  return currentlyAvailableRoutes.has(route);
}

function resolvePreferredLanding(role: string) {
  const preferredRoute = roleLandingMap[role as RoleKey];

  if (!preferredRoute) {
    return "/auth/forbidden";
  }

  if (isRouteCurrentlyAvailable(preferredRoute)) {
    return preferredRoute;
  }

  if (preferredRoute.startsWith("/admin/")) {
    return "/auth/session";
  }

  return "/auth/forbidden";
}

export function getPostLoginRoute(
  session: SessionUserSnapshot,
  returnTo?: string | null,
): PostLoginRoute {
  if (session.companies.length === 0) {
    return {
      route: "/auth/forbidden",
      activeCompanyId: null,
    };
  }

  const sanitizedReturnTo = normalizeReturnTo(returnTo);

  if (sanitizedReturnTo && isRouteCurrentlyAvailable(sanitizedReturnTo)) {
    return {
      route: sanitizedReturnTo,
      activeCompanyId: session.activeCompanyId,
    };
  }

  const activeCompanyId =
    session.activeCompanyId === null && !canSeeConsolidated(session.role)
      ? session.companies[0]?.id ?? null
      : session.activeCompanyId;

  return {
    route: resolvePreferredLanding(session.role),
    activeCompanyId,
  };
}
