"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Phone,
  Calendar,
  Menu,
  X,
  LogOut,
  Bell,
  FileUp,
  UserPlus,
  List,
  FileCheck,
  BarChart3,
  TrendingUp,
  Package,
  ChevronRight,
  ChevronDown,
  Mail,
  Wrench,
  ListTodo,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { FleurDeLis } from "@/components/brand/FleurDeLis";
import { useRouter } from "next/navigation";
import { LEAD_STATUS_LABELS, LEAD_STATUSES_ADMIN, LEAD_CATEGORIES, LEAD_CATEGORY_LABELS, type LeadStatus, type LeadCategory } from "@/lib/types";

interface DrawerProps {
  role: "admin" | "telepro" | "secretaire" | "stockage";
  userName?: string;
  unreadNotifications?: number;
  statusCounts?: Record<string, Record<string, number>>;
  pendingTasks?: number;
}

const adminNav = [
  { href: "/admin", label: "Statistique télépro", icon: TrendingUp },
  { href: "/admin/leads?status=installe", label: "Dossiers Installés", icon: FileCheck, statusParam: "installe" },
  { href: "/admin/leads", label: "Tous les leads", icon: List, hasStatusSubmenu: true },
  { href: "/admin/code-courrier", label: "Code courrier", icon: Mail },
  { href: "/admin/sav", label: "SAV", icon: Wrench },
  { href: "/admin/taches", label: "Tâches", icon: ListTodo, tasksBadge: true },
  { href: "/admin/stockage", label: "Stockage", icon: Package },
  { href: "/admin/import", label: "Import CSV", icon: FileUp },
  { href: "/admin/users", label: "Utilisateurs", icon: UserPlus },
  { href: "/admin/stats", label: "Statistiques", icon: BarChart3 },
];

const secretaireNav = [
  { href: "/admin/documents-recus", label: "Documents reçus", icon: FileCheck },
  { href: "/admin/leads", label: "Tous les leads", icon: List, hasStatusSubmenu: true },
  { href: "/admin/code-courrier", label: "Code courrier", icon: Mail },
  { href: "/admin/sav", label: "SAV", icon: Wrench },
  { href: "/admin/agenda-courrier", label: "Agenda", icon: Calendar },
  { href: "/admin/taches", label: "Tâches", icon: ListTodo, tasksBadge: true },
  { href: "/admin/import", label: "Import CSV", icon: FileUp },
  { href: "/admin/stats-secretaire", label: "Statistiques", icon: BarChart3 },
  { href: "/admin", label: "Statistique télépro", icon: TrendingUp },
];

const stockageNav = [
  { href: "/admin/stockage", label: "Stockage", icon: Package },
  { href: "/admin/sav", label: "SAV", icon: Wrench },
  { href: "/admin/taches", label: "Tâches", icon: ListTodo, tasksBadge: true },
];

const teleproNav = [
  { href: "/telepro", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/telepro/leads", label: "Mes leads", icon: Users, hasStatusSubmenu: true },
  { href: "/telepro/teleprospection", label: "Téléprospection", icon: Phone },
  { href: "/telepro/agenda", label: "Agenda", icon: Calendar },
  { href: "/telepro/taches", label: "Tâches", icon: ListTodo, tasksBadge: true },
];

export function Drawer({ role, userName, unreadNotifications = 0, statusCounts = {}, pendingTasks = 0 }: DrawerProps) {
  const [open, setOpen] = useState(false);
  // Sous-menu des statuts : fermé par défaut, ne se ferme que au clic sur la flèche (persiste à la navigation)
  // Niveau 0 : déploie les catégories ; Niveau 1 : déploie les statuts d'UNE catégorie à la fois
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<LeadCategory | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Le menu suit l'URL : /admin → menu admin/secretaire, /telepro → menu télépro
  const isAdminSpace = pathname.startsWith("/admin");
  const adminSpaceNav =
    role === "secretaire" ? secretaireNav : role === "stockage" ? stockageNav : adminNav;
  const nav = isAdminSpace ? adminSpaceNav : teleproNav;
  const adminSpaceHome =
    role === "secretaire" ? "/admin/documents-recus" : role === "stockage" ? "/admin/stockage" : "/admin";
  const adminSpaceLabel =
    role === "secretaire" ? "Espace secrétaire" : role === "stockage" ? "Espace stockage" : "Espace administrateur";

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 left-3 z-40 p-2 rounded-lg bg-white border border-line shadow-card lg:hidden"
        aria-label="Ouvrir le menu"
      >
        <Menu className="w-5 h-5 text-ink" />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 gothic-surface border-r border-line z-50 transform transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <Link href={isAdminSpace ? adminSpaceHome : "/telepro"} className="block">
                {/* Symbole seul : le texte « RS ÉCOLOGIE » du logo complet est en vert foncé et
                    tombe à 1,3:1 de contraste sur ce fond bleu marine (illisible). Le carré blanc
                    du logo d'origine le rendait lisible ; il n'existe plus. */}
                <Image
                  src="/logo-symbole.png"
                  alt="RS ÉCOLOGIE"
                  width={509}
                  height={498}
                  className="h-12 w-auto object-contain"
                  priority
                />
              </Link>
              <span className="font-gothic chrome-text text-2xl leading-tight">RS Écologie</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
                {isAdminSpace ? adminSpaceLabel : "Espace télépro"}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-2 rounded-lg hover:bg-black/5 lg:hidden text-ink"
              aria-label="Fermer le menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2 px-4" aria-hidden="true">
            <div className="chrome-rule flex-1" />
            <FleurDeLis className="w-5 h-5 shrink-0" />
            <div className="chrome-rule flex-1" />
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {nav.map((item) => {
              const homeHref = isAdminSpace ? adminSpaceHome : "/telepro";
              const isLeadsPage = pathname.startsWith("/admin/leads") && (item.href === "/admin/leads" || item.href.startsWith("/admin/leads?")) || (pathname.startsWith("/telepro/leads") && item.href === "/telepro/leads");
              const isActive =
                "statusParam" in item && item.statusParam
                  ? pathname === "/admin/leads" && searchParams.get("status") === item.statusParam
                  : item.href === "/admin/leads"
                    ? pathname === "/admin/leads" && searchParams.get("status") !== "installe"
                    : pathname === item.href ||
                      (item.href !== homeHref && pathname.startsWith(item.href.split("?")[0]));
              const currentCategory = isLeadsPage ? (searchParams.get("category") as LeadCategory | null) : null;
              const currentStatus = isLeadsPage ? searchParams.get("status") : null;
              const statuses = LEAD_STATUSES_ADMIN;
              const catTotal = (cat: LeadCategory) =>
                Object.values(statusCounts[cat] ?? {}).reduce((a, b) => a + b, 0);

              return (
                <div key={item.href} className="space-y-1">
                  {"hasStatusSubmenu" in item && item.hasStatusSubmenu ? (
                    <>
                      <div
                        className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-white text-ink font-semibold shadow-card ring-1 ring-line"
                            : "text-body hover:bg-black/[0.04] hover:text-ink"
                        }`}
                      >
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-3 flex-1 min-w-0"
                          data-testid="nav-leads"
                        >
                          <item.icon className="w-[18px] h-[18px] shrink-0" />
                          {item.label}
                        </Link>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setCategoriesExpanded((v) => !v);
                          }}
                          className="p-1 rounded-md hover:bg-black/5 text-subtle shrink-0"
                          aria-label={categoriesExpanded ? "Replier les catégories" : "Déplier les catégories"}
                          aria-expanded={categoriesExpanded}
                          data-testid="nav-leads-toggle"
                        >
                          {categoriesExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {categoriesExpanded && (
                        <div className="ml-5 pl-2 border-l border-line-strong/70 py-1 space-y-0.5">
                          {LEAD_CATEGORIES.map((cat) => {
                            const isCatActive = currentCategory === cat;
                            const isCatExpanded = expandedCategory === cat;
                            return (
                              <div key={cat} className="space-y-1">
                                <div
                                  className={`flex items-center gap-1 px-2 py-2 rounded-md transition-colors ${
                                    isCatActive
                                      ? "bg-white text-ink font-semibold ring-1 ring-line"
                                      : "text-body hover:bg-black/[0.04] hover:text-ink"
                                  }`}
                                >
                                  <Link
                                    href={`${item.href}?category=${cat}`}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center justify-between gap-2 flex-1 min-w-0 text-sm"
                                    data-testid={`nav-category-${cat}`}
                                  >
                                    <span className="truncate">{LEAD_CATEGORY_LABELS[cat]}</span>
                                    <span className="text-faint text-xs tabular-nums">{catTotal(cat)}</span>
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setExpandedCategory((v) => (v === cat ? null : cat));
                                    }}
                                    className="p-1 rounded-md hover:bg-black/5 text-subtle shrink-0"
                                    aria-label={isCatExpanded ? "Replier les statuts" : "Déplier les statuts"}
                                    aria-expanded={isCatExpanded}
                                  >
                                    {isCatExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                                {isCatExpanded && (
                                  <div className="pl-3 pr-1 py-1 space-y-1">
                                    <Link
                                      href={`${item.href}?category=${cat}`}
                                      onClick={() => setOpen(false)}
                                      className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors ${
                                        isCatActive && !currentStatus
                                          ? "bg-white text-ink font-semibold ring-1 ring-line"
                                          : "text-subtle hover:bg-black/[0.04] hover:text-ink"
                                      }`}
                                    >
                                      <span>Tous</span>
                                      <span className="text-faint text-xs tabular-nums">{catTotal(cat)}</span>
                                    </Link>
                                    {statuses.map((s) => (
                                      <Link
                                        key={s}
                                        href={`${item.href}?category=${cat}&status=${s}`}
                                        onClick={() => setOpen(false)}
                                        data-testid={`nav-status-${cat}-${s}`}
                                        className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors ${
                                          isCatActive && currentStatus === s
                                            ? "bg-white text-ink font-semibold ring-1 ring-line"
                                            : "text-subtle hover:bg-black/[0.04] hover:text-ink"
                                        }`}
                                      >
                                        <span>{LEAD_STATUS_LABELS[s as LeadStatus]}</span>
                                        <span className="text-faint text-xs tabular-nums">
                                          {statusCounts[cat]?.[s] ?? 0}
                                        </span>
                                      </Link>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isActive
                          ? "bg-white text-ink font-semibold shadow-card ring-1 ring-line"
                          : "text-body hover:bg-black/[0.04] hover:text-ink"
                      }`}
                    >
                      <item.icon className="w-[18px] h-[18px] shrink-0" />
                      {item.label}
                      {"tasksBadge" in item && item.tasksBadge && pendingTasks > 0 && (
                        <span className="ml-auto bg-brand text-white text-[11px] font-semibold px-1.5 min-w-5 text-center py-0.5 rounded-full tabular-nums">
                          {pendingTasks}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="p-3 border-t border-line space-y-1">
            {unreadNotifications > 0 && (
              <Link
                href={isAdminSpace ? "/admin/notifications" : "/telepro/notifications"}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-body hover:bg-black/[0.04]"
              >
                <Bell className="w-[18px] h-[18px] shrink-0" />
                <span>Notifications</span>
                <span className="ml-auto bg-red-500 text-white text-[11px] font-semibold px-1.5 min-w-5 text-center py-0.5 rounded-full">
                  {unreadNotifications}
                </span>
              </Link>
            )}
            {userName && (
              <div className="px-3 py-1.5 text-xs font-medium text-subtle truncate">
                {userName}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-body hover:bg-red-50 hover:text-red-700 transition-colors"
            >
              <LogOut className="w-[18px] h-[18px] shrink-0" />
              Déconnexion
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
