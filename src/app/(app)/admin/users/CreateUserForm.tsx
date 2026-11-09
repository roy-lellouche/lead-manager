"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CreateUserRole = "telepro" | "secretaire" | "stockage";

const ROLE_LABELS: Record<CreateUserRole, string> = {
  telepro: "télépro",
  secretaire: "secrétaire",
  stockage: "stockage",
};

const INPUT_CLS =
  "w-full h-9 px-3 border border-line rounded-[9px] bg-white text-ink text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors";
const LABEL_CLS = "block text-sm font-medium text-ink mb-1.5";

export function CreateUserForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<CreateUserRole>("telepro");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/admin/create-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, fullName, role }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Une erreur est survenue");
      return;
    }

    setEmail("");
    setPassword("");
    setFullName("");
    setRole("telepro");
    router.refresh();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[14px] border border-line bg-white shadow-card p-6 space-y-4"
    >
      <h2 className="text-base font-semibold text-ink">Créer un utilisateur</h2>

      {error && (
        <div className="p-3 rounded-[9px] bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className={LABEL_CLS}>Nom complet</label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className={LABEL_CLS}>Rôle</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as CreateUserRole)}
          className={INPUT_CLS}
        >
          <option value="telepro">Télépro</option>
          <option value="secretaire">Secrétaire</option>
          <option value="stockage">Stockage</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="h-9 px-5 bg-brand text-white text-sm font-medium rounded-[9px] hover:bg-brand-hover disabled:opacity-50 transition-colors"
      >
        {loading ? "Création…" : `Créer le compte ${ROLE_LABELS[role]}`}
      </button>
    </form>
  );
}
