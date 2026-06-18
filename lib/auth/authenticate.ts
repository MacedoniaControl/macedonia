import { randomUUID } from "node:crypto";
import { demoAuthUsers } from "@/lib/auth/demo-users";
import { auditEvents } from "@/lib/audit/events";
import { prisma } from "@/lib/db/prisma";
import {
  createDatabaseSession,
  createDemoSession,
} from "@/lib/auth/session";

type AuthSuccess = {
  ok: true;
  message: string;
  source: "database" | "demo";
};

type AuthFailure = {
  ok: false;
  message: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

export async function authenticateWithAvailableSource(
  identifier: string,
  password: string,
): Promise<AuthResult> {
  if (prisma) {
    const databaseUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: { equals: identifier, mode: "insensitive" } },
          { username: { equals: identifier, mode: "insensitive" } },
        ],
        isActive: true,
      },
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
    });

    if (!databaseUser || databaseUser.password !== password) {
      return {
        ok: false,
        message: "Credenciales invalidas.",
      };
    }

    const sessionToken = randomUUID();
    await createDatabaseSession(sessionToken, databaseUser.id);

    await prisma.user.update({
      where: { id: databaseUser.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: auditEvents.USER_LOGGED_IN,
        entityType: "User",
        entityId: databaseUser.id,
        userId: databaseUser.id,
        companyId: databaseUser.defaultCompanyId,
        meta: {
          authSource: "database",
        },
      },
    });

    return {
      ok: true,
      source: "database",
      message: `Sesion creada para ${databaseUser.fullName} (${databaseUser.role.name}) en ${databaseUser.defaultCompany?.name ?? "sin empresa por defecto"}.`,
    };
  }

  const demoUser = demoAuthUsers.find((user) => {
    return (
      user.email.toLowerCase() === identifier.toLowerCase() ||
      user.username.toLowerCase() === identifier.toLowerCase()
    );
  });

  if (!demoUser || demoUser.password !== password) {
    return {
      ok: false,
      message: "Credenciales invalidas para el demo actual.",
    };
  }

  await createDemoSession({
    userId: demoUser.id,
    fullName: demoUser.fullName,
    email: demoUser.email,
    username: demoUser.username,
    role: demoUser.role,
    companies: demoUser.companies,
    activeCompanyId: demoUser.defaultCompanyId,
  });

  return {
    ok: true,
    source: "demo",
    message: `Sesion demo creada para ${demoUser.fullName}. La siguiente iteracion conectara este flujo a Prisma real.`,
  };
}
