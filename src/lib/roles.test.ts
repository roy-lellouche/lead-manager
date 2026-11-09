import { describe, expect, it } from "vitest";
import {
  canAccessAdminPath,
  normalizeRole,
  roleLandingPath,
  usesAdminSpace,
} from "@/lib/roles";

describe("normalizeRole", () => {
  it("accepte les quatre rôles", () => {
    expect(normalizeRole("admin")).toBe("admin");
    expect(normalizeRole("telepro")).toBe("telepro");
    expect(normalizeRole("secretaire")).toBe("secretaire");
    expect(normalizeRole("stockage")).toBe("stockage");
  });

  it("nettoie espaces et majuscules, comme les comparaisons existantes", () => {
    expect(normalizeRole("  Stockage ")).toBe("stockage");
    expect(normalizeRole("ADMIN")).toBe("admin");
  });

  it("rend undefined sur un rôle inconnu ou absent", () => {
    expect(normalizeRole("magasinier")).toBeUndefined();
    expect(normalizeRole(null)).toBeUndefined();
    expect(normalizeRole(undefined)).toBeUndefined();
  });
});

describe("roleLandingPath", () => {
  it("envoie chaque rôle sur sa page d'accueil", () => {
    expect(roleLandingPath("admin")).toBe("/admin");
    expect(roleLandingPath("secretaire")).toBe("/admin/documents-recus");
    expect(roleLandingPath("stockage")).toBe("/admin/stockage");
    expect(roleLandingPath("telepro")).toBe("/telepro");
  });

  it("retombe sur /telepro si le rôle est inconnu", () => {
    expect(roleLandingPath(undefined)).toBe("/telepro");
  });
});

describe("usesAdminSpace", () => {
  it("place stockage dans l'espace /admin, avec admin et secrétaire", () => {
    expect(usesAdminSpace("admin")).toBe(true);
    expect(usesAdminSpace("secretaire")).toBe(true);
    expect(usesAdminSpace("stockage")).toBe(true);
    expect(usesAdminSpace("telepro")).toBe(false);
  });
});

describe("canAccessAdminPath", () => {
  it("laisse l'admin partout", () => {
    expect(canAccessAdminPath("admin", "/admin/users")).toBe(true);
    expect(canAccessAdminPath("admin", "/admin/stockage")).toBe(true);
  });

  it("garde les restrictions existantes de la secrétaire", () => {
    expect(canAccessAdminPath("secretaire", "/admin/documents-recus")).toBe(true);
    expect(canAccessAdminPath("secretaire", "/admin/leads")).toBe(true);
    expect(canAccessAdminPath("secretaire", "/admin/users")).toBe(false);
    expect(canAccessAdminPath("secretaire", "/admin/rentabilite")).toBe(false);
    expect(canAccessAdminPath("secretaire", "/admin/parametres-financiers")).toBe(false);
    expect(canAccessAdminPath("secretaire", "/admin/users/telepro/42")).toBe(false);
    expect(canAccessAdminPath("secretaire", "/admin/stats")).toBe(false);
    expect(canAccessAdminPath("secretaire", "/admin/stats/global")).toBe(false);
  });

  it("n'ouvre au rôle stockage que les pages Stockage, SAV et Tâches", () => {
    expect(canAccessAdminPath("stockage", "/admin/stockage")).toBe(true);
    expect(canAccessAdminPath("stockage", "/admin/sav")).toBe(true);
    expect(canAccessAdminPath("stockage", "/admin/taches")).toBe(true);
    expect(canAccessAdminPath("stockage", "/admin")).toBe(false);
    expect(canAccessAdminPath("stockage", "/admin/leads")).toBe(false);
    expect(canAccessAdminPath("stockage", "/admin/users")).toBe(false);
    expect(canAccessAdminPath("stockage", "/admin/stats")).toBe(false);
    expect(canAccessAdminPath("stockage", "/admin/documents-recus")).toBe(false);
  });

  it("ne confond pas un préfixe avec un segment (liste blanche stricte)", () => {
    expect(canAccessAdminPath("stockage", "/admin/stockage-archive")).toBe(false);
  });

  it("ouvre la page Tâches à la secrétaire", () => {
    expect(canAccessAdminPath("secretaire", "/admin/taches")).toBe(true);
  });

  it("ferme l'espace admin au télépro", () => {
    expect(canAccessAdminPath("telepro", "/admin/stockage")).toBe(false);
    expect(canAccessAdminPath("telepro", "/admin")).toBe(false);
  });

  it("laisse le rôle inconnu entrer dans /admin : la page d'accueil lui propose ce choix", () => {
    expect(canAccessAdminPath(undefined, "/admin")).toBe(true);
  });
});
