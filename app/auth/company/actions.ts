"use server";

import { revalidatePath } from "next/cache";
import { auditEvents } from "@/lib/audit/events";
import { assertCompanyAccess, CompanyAccessDeniedError } from "@/lib/auth/company-scope";
import { getCompanyFromOptions } from "@/lib/auth/company-access";
import { requireAuthenticatedSession } from "@/lib/auth/server-guards";
import { persistActiveCompanySelection } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export type SetActiveCompanyResult = {
  status: "success" | "error";
  message: string;
  activeCompanyId: string | null;
};

export async function setActiveCompany(
  companyId: string | null,
): Promise<SetActiveCompanyResult> {
  const session = await requireAuthenticatedSession();

  try {
    const company = await assertCompanyAccess(companyId, session);

    await persistActiveCompanySelection(session, companyId);

    if (prisma) {
      await prisma.auditLog.create({
        data: {
          action: auditEvents.ACTIVE_COMPANY_CHANGED,
          entityType: "CompanyScope",
          entityId: companyId,
          userId: session.userId,
          companyId,
          meta: {
            source: session.source,
            role: session.role,
          },
        },
      });
    }

    revalidatePath("/auth/login");
    revalidatePath("/admin");

    return {
      status: "success",
      message:
        company === null
          ? "Vista consolidada activada."
          : `Empresa activa actualizada a ${company.name}.`,
      activeCompanyId: companyId,
    };
  } catch (error) {
    if (error instanceof CompanyAccessDeniedError) {
      return {
        status: "error",
        message: error.message,
        activeCompanyId: session.activeCompanyId,
      };
    }

    const fallbackCompany = getCompanyFromOptions(
      session.companies,
      session.activeCompanyId,
    );

    return {
      status: "error",
      message:
        fallbackCompany?.name
          ? `No se pudo cambiar la empresa activa. Se mantiene ${fallbackCompany.name}.`
          : "No se pudo cambiar la empresa activa.",
      activeCompanyId: session.activeCompanyId,
    };
  }
}
