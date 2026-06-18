import { cookies } from "next/headers";
import {
  canSeeConsolidated,
  getFallbackActiveCompanyId,
  type SessionCompanyOption,
} from "@/lib/auth/company-access";
import { prisma } from "@/lib/db/prisma";

const SESSION_COOKIE_NAME =
  process.env.AUTH_SESSION_NAME || "sumi_session";
const SESSION_DURATION_HOURS = 12;

export type SessionUserSnapshot = {
  userId: string;
  fullName: string;
  email: string;
  username: string;
  role: string;
  companies: SessionCompanyOption[];
  activeCompanyId: string | null;
  source: "database" | "demo";
};

type DemoSessionPayload = {
  userId: string;
  fullName: string;
  email: string;
  username: string;
  role: string;
  companies: SessionCompanyOption[];
  activeCompanyId: string | null;
};

function getSessionExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_DURATION_HOURS);
  return expiresAt;
}

function encodeDemoSession(payload: DemoSessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeDemoSession(value: string): DemoSessionPayload | null {
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    return JSON.parse(decoded) as DemoSessionPayload;
  } catch {
    return null;
  }
}

function normalizeActiveCompanyId(
  role: string,
  companies: SessionCompanyOption[],
  preferredCompanyId: string | null,
) {
  if (preferredCompanyId === null && canSeeConsolidated(role)) {
    return null;
  }

  return getFallbackActiveCompanyId(companies, preferredCompanyId);
}

async function writeSessionCookie(value: string, expiresAt: Date) {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function createDatabaseSession(
  token: string,
  userId: string,
): Promise<Date> {
  if (!prisma) {
    throw new Error("Prisma no esta disponible para crear sesion.");
  }

  const expiresAt = getSessionExpiryDate();

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  await writeSessionCookie(`db:${token}`, expiresAt);

  return expiresAt;
}

export async function createDemoSession(payload: DemoSessionPayload) {
  const expiresAt = getSessionExpiryDate();
  const encoded = encodeDemoSession(payload);

  await writeSessionCookie(`demo:${encoded}`, expiresAt);

  return expiresAt;
}

export async function persistActiveCompanySelection(
  session: SessionUserSnapshot,
  companyId: string | null,
) {
  if (session.source === "database") {
    if (!prisma) {
      throw new Error("Prisma no esta disponible para guardar empresa activa.");
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        defaultCompanyId: companyId,
      },
    });

    return;
  }

  await createDemoSession({
    userId: session.userId,
    fullName: session.fullName,
    email: session.email,
    username: session.username,
    role: session.role,
    companies: session.companies,
    activeCompanyId: companyId,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (cookieValue?.startsWith("db:") && prisma) {
    await prisma.session.deleteMany({
      where: {
        token: cookieValue.slice(3),
      },
    });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getCurrentSessionUser(): Promise<SessionUserSnapshot | null> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!cookieValue) {
    return null;
  }

  if (cookieValue.startsWith("demo:")) {
    const payload = decodeDemoSession(cookieValue.slice(5));

    if (!payload) {
      return null;
    }

    return {
      ...payload,
      activeCompanyId: normalizeActiveCompanyId(
        payload.role,
        payload.companies,
        payload.activeCompanyId,
      ),
      source: "demo",
    };
  }

  if (cookieValue.startsWith("db:") && prisma) {
    const token = cookieValue.slice(3);
    const session = await prisma.session.findUnique({
      where: { token },
      include: {
        user: {
          include: {
            role: true,
            defaultCompany: true,
            companies: {
              where: {
                canAccess: true,
                company: {
                  isActive: true,
                },
              },
              include: {
                company: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    const companies = session.user.companies
      .map(({ company }) => ({
        id: company.id,
        name: company.name,
        slug: company.slug,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      userId: session.user.id,
      fullName: session.user.fullName,
      email: session.user.email,
      username: session.user.username,
      role: session.user.role.key,
      companies,
      activeCompanyId: normalizeActiveCompanyId(
        session.user.role.key,
        companies,
        session.user.defaultCompanyId,
      ),
      source: "database",
    };
  }

  return null;
}
