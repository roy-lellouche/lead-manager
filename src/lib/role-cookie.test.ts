import { describe, expect, it } from "vitest";
import { ROLE_COOKIE_TTL_SECONDS, readRoleCookie, signRoleCookie } from "@/lib/role-cookie";

const SECRET = "test-secret";
const USER = "8c5c1c2e-1111-4a3b-9c1d-123456789abc";
const NOW = 1_800_000_000;

describe("cookie de rôle signé", () => {
  it("relit le rôle qu'il a signé", async () => {
    const value = await signRoleCookie(USER, "secretaire", SECRET, NOW);
    expect(await readRoleCookie(value, USER, SECRET, NOW + 10)).toBe("secretaire");
  });

  it("ignore un cookie expiré", async () => {
    const value = await signRoleCookie(USER, "admin", SECRET, NOW);
    expect(await readRoleCookie(value, USER, SECRET, NOW + ROLE_COOKIE_TTL_SECONDS)).toBeUndefined();
  });

  it("ignore un cookie émis pour un autre utilisateur", async () => {
    const value = await signRoleCookie(USER, "admin", SECRET, NOW);
    expect(await readRoleCookie(value, "autre-user", SECRET, NOW)).toBeUndefined();
  });

  it("ignore un rôle modifié à la main", async () => {
    const value = await signRoleCookie(USER, "telepro", SECRET, NOW);
    const forged = value.replace(".telepro.", ".admin.");
    expect(await readRoleCookie(forged, USER, SECRET, NOW)).toBeUndefined();
  });

  it("ignore une signature faite avec un autre secret", async () => {
    const value = await signRoleCookie(USER, "admin", "autre-secret", NOW);
    expect(await readRoleCookie(value, USER, SECRET, NOW)).toBeUndefined();
  });

  it("ignore les valeurs absentes ou malformées", async () => {
    expect(await readRoleCookie(undefined, USER, SECRET, NOW)).toBeUndefined();
    expect(await readRoleCookie("n'importe quoi", USER, SECRET, NOW)).toBeUndefined();
    expect(await readRoleCookie(`${USER}.admin.${NOW + 60}.%%%`, USER, SECRET, NOW)).toBeUndefined();
  });
});
