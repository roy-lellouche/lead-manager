"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "@/components/NavigationProgress";

/**
 * useRouter() dont push/replace affichent la barre de progression : les filtres
 * et la pagination changent l'URL sans lien cliqué, donc sans retour visuel.
 */
export function useProgressRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<typeof router.push>[1]) => {
        startNavigationProgress(href);
        router.push(href, options);
      },
      replace: (href: string, options?: Parameters<typeof router.replace>[1]) => {
        startNavigationProgress(href);
        router.replace(href, options);
      },
    }),
    [router]
  );
}
