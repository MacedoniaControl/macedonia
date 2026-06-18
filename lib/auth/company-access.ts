import type { RoleKey } from "@/lib/auth/roles";

export type SessionCompanyOption = {
  id: string;
  name: string;
  slug: string;
};

const consolidatedRoles: RoleKey[] = ["OWNER", "ADMIN"];

export function canSeeConsolidated(role: string) {
  return consolidatedRoles.includes(role as RoleKey);
}

export function getFallbackActiveCompanyId(
  companies: SessionCompanyOption[],
  preferredCompanyId: string | null,
) {
  if (preferredCompanyId && companies.some((company) => company.id === preferredCompanyId)) {
    return preferredCompanyId;
  }

  const [firstCompany] = [...companies].sort((left, right) => {
    return left.name.localeCompare(right.name);
  });

  return firstCompany?.id ?? null;
}

export function getCompanyFromOptions(
  companies: SessionCompanyOption[],
  companyId: string | null,
) {
  if (!companyId) {
    return null;
  }

  return companies.find((company) => company.id === companyId) ?? null;
}
