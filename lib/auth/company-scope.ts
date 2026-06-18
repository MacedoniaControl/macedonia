import { auditEvents } from "@/lib/audit/events";
import {
  canSeeConsolidated,
  getCompanyFromOptions,
  type SessionCompanyOption,
} from "@/lib/auth/company-access";
import { prisma } from "@/lib/db/prisma";
import { requireAuthenticatedSession } from "@/lib/auth/server-guards";
import type { SessionUserSnapshot } from "@/lib/auth/session";

export class CompanyAccessDeniedError extends Error {
  constructor(message = "El usuario no tiene acceso a la empresa solicitada.") {
    super(message);
    this.name = "CompanyAccessDeniedError";
  }
}

async function registerDeniedCompanyAccess(
  session: SessionUserSnapshot,
  companyId: string | null,
) {
  if (!prisma) {
    return;
  }

  await prisma.auditLog.create({
    data: {
      action: auditEvents.COMPANY_ACCESS_DENIED,
      entityType: "CompanyScope",
      entityId: companyId,
      userId: session.userId,
      companyId,
      meta: {
        role: session.role,
        source: session.source,
      },
    },
  });
}

export async function assertCompanyAccess(
  companyId: string | null,
  session?: SessionUserSnapshot,
): Promise<SessionCompanyOption | null> {
  const resolvedSession = session ?? (await requireAuthenticatedSession());

  if (companyId === null) {
    if (canSeeConsolidated(resolvedSession.role)) {
      return null;
    }

    await registerDeniedCompanyAccess(resolvedSession, companyId);
    throw new CompanyAccessDeniedError(
      "Solo Owner y Admin pueden usar vista consolidada.",
    );
  }

  const company = getCompanyFromOptions(resolvedSession.companies, companyId);

  if (!company) {
    await registerDeniedCompanyAccess(resolvedSession, companyId);
    throw new CompanyAccessDeniedError();
  }

  return company;
}

export async function getActiveCompany(session?: SessionUserSnapshot) {
  const resolvedSession = session ?? (await requireAuthenticatedSession());
  return assertCompanyAccess(resolvedSession.activeCompanyId, resolvedSession);
}
