import type { UserRole } from "@/lib/types";

/**
 * Le rôle stocké en base a déjà été saisi à la main par le passé : on le
 * normalise partout avant comparaison (espaces, majuscules).
 */
export function normalizeRole(raw: unknown): UserRole | undefined {
  const value = raw?.toString().trim().toLowerCase();
  return value === "admin" || value === "telepro" || value === "secretaire" || value === "stockage"
    ? value
    : undefined;
}

/** Page d'accueil de chaque espace, après connexion ou redirection. */
export function roleLandingPath(role: UserRole | undefined): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "secretaire":
      return "/admin/documents-recus";
    case "stockage":
      return "/admin/stockage";
    default:
      return "/telepro";
  }
}

/** Les rôles dont l'espace vit sous /admin. */
export function usesAdminSpace(role: UserRole | undefined): boolean {
  return role === "admin" || role === "secretaire" || role === "stockage";
}

const SECRETAIRE_DENIED_PREFIXES = ["/admin/users", "/admin/stats", "/admin/rentabilite", "/admin/parametres-financiers"];
const STOCKAGE_ALLOWED_PREFIXES = ["/admin/stockage", "/admin/sav", "/admin/taches"];

/**
 * Restrictions à l'intérieur de l'espace /admin. Les pages admin lisent leurs
 * données en service role sans revérifier le rôle : c'est ici que se joue le
 * cloisonnement entre secrétaire, stockage et admin.
 */
export function canAccessAdminPath(role: UserRole | undefined, pathname: string): boolean {
  if (role === "admin") return true;

  if (role === "secretaire") {
    return !SECRETAIRE_DENIED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  }

  // Le rôle stockage ne voit que Stockage, SAV et Tâches : liste blanche, pas liste noire,
  // pour qu'une page admin ajoutée plus tard lui reste fermée par défaut.
  if (role === "stockage") {
    return STOCKAGE_ALLOWED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
  }

  if (role === "telepro") return false;

  // Rôle inconnu / profil introuvable : la page d'accueil propose explicitement
  // « Espace administrateur » dans ce cas (src/app/page.tsx). On ne ferme pas
  // cette porte ici, ce serait un changement de comportement hors sujet.
  return true;
}
