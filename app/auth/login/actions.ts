"use server";

import { redirect } from "next/navigation";
import { authenticateWithAvailableSource } from "@/lib/auth/authenticate";
import { loginSchema } from "@/lib/auth/login-schema";
import { getPostLoginRoute } from "@/lib/auth/post-login-route";
import { getCurrentSessionUser } from "@/lib/auth/session";

export type LoginFormState = {
  status: "idle" | "error" | "success";
  message: string;
  source?: "database" | "demo";
};

export async function authenticateUser(
  _previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Datos invalidos.",
    };
  }

  const { identifier, password } = parsed.data;
  const result = await authenticateWithAvailableSource(identifier, password);

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
    };
  }

  const currentSession = await getCurrentSessionUser();

  if (!currentSession) {
    return {
      status: "error",
      message: "La sesion se creo, pero no pudo recuperarse para redirigir.",
    };
  }

  const returnToValue = formData.get("returnTo");
  const returnTo =
    typeof returnToValue === "string" && returnToValue.length > 0
      ? returnToValue
      : null;
  const destination = getPostLoginRoute(currentSession, returnTo);

  redirect(destination.route);
}
