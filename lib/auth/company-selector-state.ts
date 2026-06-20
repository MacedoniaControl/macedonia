import {
  canSeeConsolidated,
  type SessionCompanyOption,
} from "@/lib/auth/company-access";
import { getActiveCompany } from "@/lib/auth/company-scope";
import { requireAuthenticatedSession } from "@/lib/auth/server-guards";
import type { SessionUserSnapshot } from "@/lib/auth/session";

export type CompanySelectorState = {
  session: SessionUserSnapshot;
  companies: SessionCompanyOption[];
  activeCompanyId: string | null;
  activeCompany: SessionCompanyOption | null;
  activeCompanyLabel: string;
  canSeeConsolidated: boolean;
  hasCompanyOptions: boolean;
  isSingleCompanyFixed: boolean;
};

export async function getCompanySelectorState(
  session?: SessionUserSnapshot,
): Promise<CompanySelectorState> {
  const resolvedSession = session ?? (await requireAuthenticatedSession());
  const activeCompany = await getActiveCompany(resolvedSession);
  const consolidatedEnabled = canSeeConsolidated(resolvedSession.role);
  const isSingleCompanyFixed =
    resolvedSession.companies.length <= 1 && !consolidatedEnabled;

  return {
    session: resolvedSession,
    companies: resolvedSession.companies,
    activeCompanyId: resolvedSession.activeCompanyId,
    activeCompany,
    activeCompanyLabel:
      activeCompany?.name ??
      (resolvedSession.activeCompanyId === null && consolidatedEnabled
        ? "Consolidado"
        : "Sin empresa valida"),
    canSeeConsolidated: consolidatedEnabled,
    hasCompanyOptions: resolvedSession.companies.length > 0,
    isSingleCompanyFixed,
  };
}
