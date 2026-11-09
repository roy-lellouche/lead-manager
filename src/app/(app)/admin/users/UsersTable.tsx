"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Settings } from "lucide-react";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const TELEPRO_CONFIG_PATH = (id: string) => `/admin/users/telepro/${id}`;

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface UsersTableProps {
  users: User[];
}

export function UsersTable({ users }: UsersTableProps) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();

  const normalize = (r: string) => r?.toString().trim().toLowerCase();
  const telepros = users.filter((u) => normalize(u.role) === "telepro");
  const secretaires = users.filter((u) => normalize(u.role) === "secretaire");
  const admins = users.filter((u) => normalize(u.role) === "admin");
  const stockages = users.filter((u) => normalize(u.role) === "stockage");

  const handleDelete = async (telepro: User) => {
    if (!confirm(`Supprimer le télépro ${telepro.full_name || telepro.email} ?\n\nSes leads devront être redistribués.`)) return;
    setDeleting(telepro.id);
    const res = await fetch("/api/admin/delete-telepro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ teleproId: telepro.id }),
    });
    setDeleting(null);
    const data = await res.json();
    if (data.redirectTo) {
      router.push(data.redirectTo);
    } else if (res.ok) {
      router.refresh();
    } else {
      alert(data.error || "Erreur");
    }
  };

  const teleproConfigHref = (id: string) => TELEPRO_CONFIG_PATH(id);

  return (
    <div className="rounded-[14px] border border-line bg-white shadow-card overflow-hidden">
      <Table>
        <TableHeader className="bg-canvas border-b border-line">
          <TableRow className="border-0 hover:bg-transparent">
            <TableHead className="py-3 px-4 text-xs font-semibold text-subtle uppercase tracking-wide">
              Nom
            </TableHead>
            <TableHead className="py-3 px-4 text-xs font-semibold text-subtle uppercase tracking-wide">
              Email
            </TableHead>
            <TableHead className="py-3 px-4 text-xs font-semibold text-subtle uppercase tracking-wide">
              Rôle
            </TableHead>
            <TableHead className="py-3 px-4 text-xs font-semibold text-subtle uppercase tracking-wide w-24">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {admins.map((u) => (
            <TableRow key={u.id} className="border-b border-line hover:bg-canvas/60">
              <TableCell className="py-3.5 px-4 font-medium text-ink">
                {u.full_name || "-"}
              </TableCell>
              <TableCell className="py-3.5 px-4 text-subtle text-sm">{u.email}</TableCell>
              <TableCell className="py-3.5 px-4">
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-brand-soft text-brand">
                  Admin
                </span>
              </TableCell>
              <TableCell className="py-3.5 px-4" />
            </TableRow>
          ))}
          {secretaires.map((u) => (
            <TableRow key={u.id} className="border-b border-line hover:bg-canvas/60">
              <TableCell className="py-3.5 px-4 font-medium text-ink">
                {u.full_name || "-"}
              </TableCell>
              <TableCell className="py-3.5 px-4 text-subtle text-sm">{u.email}</TableCell>
              <TableCell className="py-3.5 px-4">
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-line-soft text-subtle">
                  Secrétaire
                </span>
              </TableCell>
              <TableCell className="py-3.5 px-4" />
            </TableRow>
          ))}
          {stockages.map((u) => (
            <TableRow key={u.id} className="border-b border-line hover:bg-canvas/60">
              <TableCell className="py-3.5 px-4 font-medium text-ink">
                {u.full_name || "-"}
              </TableCell>
              <TableCell className="py-3.5 px-4 text-subtle text-sm">{u.email}</TableCell>
              <TableCell className="py-3.5 px-4">
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-line-soft text-subtle">
                  Stockage
                </span>
              </TableCell>
              <TableCell className="py-3.5 px-4" />
            </TableRow>
          ))}
          {telepros.map((u) => (
            <TableRow
              key={u.id}
              className="border-b border-line hover:bg-canvas/80 group cursor-pointer"
              onClick={() => router.push(teleproConfigHref(u.id))}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(teleproConfigHref(u.id));
                }
              }}
            >
              <TableCell className="py-3.5 px-4 font-medium text-brand">
                {u.full_name || "-"}
              </TableCell>
              <TableCell className="py-3.5 px-4 text-subtle text-sm">{u.email}</TableCell>
              <TableCell className="py-3.5 px-4">
                <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-line text-ink">
                  Télépro
                </span>
              </TableCell>
              <TableCell
                className="py-3.5 px-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1">
                  <Link
                    href={teleproConfigHref(u.id)}
                    className="p-1.5 text-subtle hover:bg-line rounded-[7px] inline-flex transition-colors"
                    title="Configurer l'agent IA"
                  >
                    <Settings className="w-4 h-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(u)}
                    disabled={!!deleting}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-[7px] disabled:opacity-50 transition-colors"
                    title="Supprimer le télépro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
