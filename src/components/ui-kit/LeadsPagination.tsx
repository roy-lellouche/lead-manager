"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PER_PAGE_COOKIE, PER_PAGE_OPTIONS, clampPage, pageCount, pageNumbers } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type LeadsPaginationProps = {
  /** Page courante, 1-indexée et déjà clampée par la page serveur. */
  page: number;
  per: number;
  /** Nombre total de leads pour le filtre courant. */
  total: number;
};

export function LeadsPagination({ page, per, total }: LeadsPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [gotoValue, setGotoValue] = useState("");

  const count = pageCount(total, per);

  const pushWith = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const goToPage = (target: number) => {
    pushWith((params) => {
      if (target <= 1) params.delete("page");
      else params.set("page", String(target));
    });
  };

  const changePerPage = (value: string) => {
    // Cookie lisible côté serveur : la prochaine visite se rend directement à la bonne taille.
    document.cookie = `${PER_PAGE_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    pushWith((params) => {
      params.set("per", value);
      params.delete("page");
    });
  };

  const handleGoto = (event: React.FormEvent) => {
    event.preventDefault();

    const target = Number(gotoValue);
    // Saisie vide ou non numérique : l'intention est ambiguë, on s'abstient plutôt que de deviner.
    // `Number("")` vaut 0 et passerait `Number.isInteger` — d'où le test sur la chaîne elle-même,
    // sans lequel un champ vide validé par inadvertance enverrait sur la page 1.
    if (!gotoValue.trim() || !Number.isInteger(target)) return;

    // Même règle de bornage que le serveur : 9999 mène à la dernière page, 0 à la première.
    goToPage(clampPage(target, count));

    // Next.js ne remonte PAS les Client Components quand seuls les search params changent (il patche
    // l'arbre RSC). Sans ce reset, le champ garderait « 6 » après le saut, puis continuerait de
    // l'afficher après un clic sur le numéro 3 — un chiffre qui ne veut plus rien dire.
    setGotoValue("");
  };

  // Une seule page : la barre n'apporterait rien.
  if (count <= 1) return null;

  const first = (page - 1) * per + 1;
  const last = Math.min(page * per, total);

  return (
    <div
      data-testid="pagination"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-sm text-subtle">
        {first}–{last} sur {total} lead{total > 1 ? "s" : ""}
      </p>

      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            data-testid="pagination-prev"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            aria-label="Page précédente"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-line-soft"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pageNumbers(page, count).map((entry, index) =>
            entry === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                aria-hidden="true"
                className="px-1 text-sm text-faint"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                data-testid={`pagination-page-${entry}`}
                onClick={() => goToPage(entry)}
                disabled={entry === page}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? "page" : undefined}
                className={cn(
                  "h-8 min-w-8 rounded-md border px-2 text-sm",
                  entry === page
                    ? "cursor-default border-brand bg-brand font-semibold text-white"
                    : "border-line text-ink hover:bg-line-soft"
                )}
              >
                {entry}
              </button>
            )
          )}

          <button
            type="button"
            data-testid="pagination-next"
            onClick={() => goToPage(page + 1)}
            disabled={page >= count}
            aria-label="Page suivante"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-line-soft"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>

        <form
          data-testid="pagination-goto-form"
          onSubmit={handleGoto}
          noValidate
          className="flex items-center gap-2 text-sm text-subtle"
        >
          <label htmlFor="pagination-goto">Aller à</label>
          <input
            id="pagination-goto"
            data-testid="pagination-goto"
            type="number"
            min={1}
            max={count}
            value={gotoValue}
            onChange={(event) => setGotoValue(event.target.value)}
            aria-label="Aller à la page"
            className="h-8 w-16 rounded-md border border-line bg-white px-2 text-sm text-ink"
          />
        </form>

        <label className="flex items-center gap-2 text-sm text-subtle">
          Par page
          <select
            data-testid="pagination-per"
            value={per}
            onChange={(event) => changePerPage(event.target.value)}
            className="h-8 rounded-md border border-line bg-white px-2 text-sm text-ink"
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
