import { normalizeRole } from "@/lib/roles";
import type { UserRole } from "@/lib/types";

/**
 * Cache du rôle dans un cookie signé, lu par le middleware.
 *
 * Sans lui, chaque navigation sous /admin ou /telepro relisait `profiles` dans
 * le middleware avant même le rendu de la page (~3 500 requêtes/jour, 65 ms de
 * moyenne, jusqu'à 2 s). Le rôle change très rarement : on le garde quelques
 * minutes dans un cookie HttpOnly signé (HMAC-SHA256) et lié à l'utilisateur.
 *
 * Un cookie falsifié, expiré ou appartenant à un autre utilisateur est ignoré :
 * le middleware relit alors simplement `profiles`. Un changement de rôle est
 * donc pris en compte au plus tard après ROLE_COOKIE_TTL_SECONDS.
 */
export const ROLE_COOKIE = "lm_role";
export const ROLE_COOKIE_TTL_SECONDS = 5 * 60;

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

function importKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    keyCache.set(secret, key);
  }
  return key;
}

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function signRoleCookie(
  userId: string,
  role: UserRole,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<string> {
  const payload = `${userId}.${role}.${nowSeconds + ROLE_COOKIE_TTL_SECONDS}`;
  const sig = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(sig)}`;
}

/** Rôle porté par le cookie s'il est authentique, non expiré et émis pour `userId`. */
export async function readRoleCookie(
  value: string | undefined,
  userId: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<UserRole | undefined> {
  if (!value) return undefined;
  const parts = value.split(".");
  if (parts.length !== 4) return undefined;
  const [cookieUser, rawRole, rawExp, rawSig] = parts;

  if (cookieUser !== userId) return undefined;
  const exp = Number(rawExp);
  if (!Number.isInteger(exp) || exp <= nowSeconds) return undefined;
  const role = normalizeRole(rawRole);
  if (!role || role !== rawRole) return undefined;

  const sig = fromBase64Url(rawSig);
  if (!sig) return undefined;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await importKey(secret),
    sig,
    encoder.encode(`${cookieUser}.${rawRole}.${rawExp}`)
  );
  return ok ? role : undefined;
}
