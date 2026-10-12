"use server";

import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth-redirect";
import { tryReadAuthConfig } from "@/lib/server/auth-config";
import {
  checkLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "@/lib/server/login-throttle";
import { createOwnerSession, deleteOwnerSession, getClientKey } from "@/lib/server/session";
import { passcodeMatches } from "@/lib/server/session-token";

export interface LoginState {
  error?: string;
}

const MAX_PASSCODE_INPUT = 256;
const FAILURE_DELAY_MS = 400;

export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const passcode = formData.get("passcode");
  const next = safeRedirectPath(formData.get("next"));

  if (typeof passcode !== "string" || passcode.length === 0) {
    return { error: "Enter your passcode." };
  }

  const config = tryReadAuthConfig();
  if (!config) {
    return { error: "Sign-in isn't available because the server is missing its configuration." };
  }

  const clientKey = await getClientKey();
  const gate = checkLoginAllowed(clientKey);
  if (!gate.allowed) {
    const minutes = Math.ceil(gate.retryAfterSeconds / 60);
    return {
      error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  if (passcode.length > MAX_PASSCODE_INPUT || !passcodeMatches(passcode, config.passcode)) {
    recordLoginFailure(clientKey);
    // Never log the submitted value.
    console.warn("[auth] Failed owner sign-in attempt.");
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return { error: "That passcode isn't correct." };
  }

  clearLoginFailures(clientKey);
  await createOwnerSession();
  redirect(next);
}

export async function logout(): Promise<void> {
  await deleteOwnerSession();
  redirect("/login?signedOut=1");
}
