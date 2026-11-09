"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [canSetup, setCanSetup] = useState<boolean | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const router = useRouter();

  const runCheck = async () => {
    setCheckError(null);
    setCanSetup(null);
    try {
      const res = await fetch("/api/setup/check");
      const text = await res.text();
      let data: { canSetup?: boolean; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        setCheckError(
          res.ok
            ? "Réponse serveur invalide"
            : `Erreur ${res.status}: ${text.slice(0, 200)}`
        );
        return;
      }
      if (data.error) {
        setCheckError(data.error);
      } else {
        setCanSetup(data.canSetup ?? null);
      }
    } catch (err) {
      const msg =
        err instanceof TypeError && err.message?.includes("fetch")
          ? "Serveur inaccessible. Lancez 'npm run dev' dans le dossier lead-manager."
          : err instanceof Error
          ? err.message
          : "Erreur inconnue";
      setCheckError(msg);
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });

      const text = await res.text();
      let data: { error?: string; success?: boolean };
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(res.ok ? "Réponse invalide" : `Erreur ${res.status}`);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Une erreur est survenue");
        setLoading(false);
        return;
      }

      router.refresh();
      router.push("/login");
    } catch (err) {
      setLoading(false);
      const msg =
        err instanceof TypeError && (err.message?.includes("fetch") || err.message?.includes("Failed"))
          ? "Impossible de joindre le serveur. Vérifiez que 'npm run dev' est lancé (vous êtes sur le port 3001)."
          : err instanceof Error
          ? err.message
          : "Erreur de connexion";
      setError(msg);
    }
  };

  if (canSetup === null && !checkError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="animate-pulse text-subtle">Chargement...</div>
      </div>
    );
  }

  if (checkError) {
    return (
      <AuthShell
        title="Erreur de vérification"
        footer={
          <Link href="/" className="text-brand hover:underline">
            Retour à l&apos;accueil
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="rounded-[9px] bg-[#fee2e2] px-3 py-2 text-sm text-[#b91c1c]">
            {checkError}
          </div>
          <p className="text-sm text-subtle">
            Vérifiez que la migration Supabase a été exécutée et que les variables d&apos;environnement sont correctes dans .env.local
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={runCheck} className="w-full">
              Réessayer
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setCheckError(null);
                setCanSetup(true);
              }}
              className="w-full"
            >
              Continuer quand même (créer un admin)
            </Button>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (!canSetup) {
    return (
      <AuthShell title="Configuration déjà effectuée">
        <div className="space-y-4">
          <p className="text-sm text-subtle">
            Un administrateur existe déjà. Utilisez la page de connexion.
          </p>
          <Link href="/login" className={cn(buttonVariants(), "w-full justify-center")}>
            Se connecter
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Première configuration"
      subtitle="Créez le compte administrateur"
      footer={
        <Link href="/" className="text-brand hover:underline">
          Retour à l&apos;accueil
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-[9px] bg-[#fee2e2] px-3 py-2 text-sm text-[#b91c1c]">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="fullName" className="text-sm font-medium text-ink">
            Nom complet
          </label>
          <Input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink">
            Mot de passe
          </label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Création..." : "Créer le compte admin"}
        </Button>
      </form>
    </AuthShell>
  );
}
