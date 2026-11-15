"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const START_EVENT = "app:navigation-start";

/**
 * Signale qu'une navigation programmatique (router.push) démarre, pour afficher
 * la barre de progression. Ignoré si l'URL cible est déjà l'URL courante
 * (sinon la barre ne se terminerait jamais).
 */
export function startNavigationProgress(href?: string) {
  if (typeof window === "undefined") return;
  if (href) {
    const target = new URL(href, window.location.href);
    if (target.pathname + target.search === window.location.pathname + window.location.search) return;
  }
  window.dispatchEvent(new Event(START_EVENT));
}

/**
 * Fine barre en haut de l'écran pendant les changements de page : sans elle,
 * un clic sur un lien ou un filtre ne donnait aucun retour tant que le serveur
 * n'avait pas répondu, et l'appli paraissait figée.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (safetyRef.current) clearTimeout(safetyRef.current);
    tickRef.current = null;
    safetyRef.current = null;
  };

  useEffect(() => {
    const start = () => {
      clearTimers();
      setProgress(8);
      tickRef.current = setInterval(() => {
        // Avance de moins en moins vite, sans jamais atteindre 100 % seule.
        setProgress((p) => (p == null ? p : p + (90 - p) * 0.08));
      }, 200);
      // Filet de sécurité : navigation annulée ou interceptée.
      safetyRef.current = setTimeout(() => {
        clearTimers();
        setProgress(null);
      }, 15000);
    };

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      start();
    };

    window.addEventListener(START_EVENT, start);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener(START_EVENT, start);
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, []);

  // L'URL a changé : la nouvelle page est affichée, on termine la barre.
  useEffect(() => {
    if (!tickRef.current && !safetyRef.current) return;
    clearTimers();
    setProgress(100);
    const t = setTimeout(() => setProgress(null), 250);
    return () => clearTimeout(t);
  }, [pathname, searchParams]);

  if (progress == null) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none"
      role="progressbar"
      aria-label="Chargement de la page"
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full bg-brand shadow-[0_0_8px_var(--color-brand,#2563eb)] transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: progress >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
