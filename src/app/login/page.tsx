"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const msg = searchParams.get("message");
    if (msg === "Compte désactivé") {
      setError("Votre compte a été désactivé. Contactez l'administrateur.");
      setSuccess(null);
    } else if (msg === "Mot de passe modifié") {
      setError(null);
      setSuccess("Votre mot de passe a été modifié. Vous pouvez vous connecter.");
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabaseUrl =
      (typeof window !== "undefined" && (window as unknown as { __SUPABASE_ENV?: { url: string } }).__SUPABASE_ENV?.url) ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "";
    if (
      !supabaseUrl ||
      supabaseUrl.includes("xxxxx") ||
      supabaseUrl.includes("placeholder")
    ) {
      setError(
        "Configuration manquante : remplacez XXXXXXX dans .env.local par l’URL de votre projet Supabase (ex. https://abcdef.supabase.co), puis redémarrez le serveur (npm run dev) et rechargez la page."
      );
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        return;
      }

      // Redirection complète pour que les cookies de session soient bien envoyés au serveur (Netlify/serverless)
      window.location.href = "/";
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Load failed") || msg.includes("Failed to fetch") || msg.includes("fetch")) {
        setError(
          "Impossible de contacter le serveur d'authentification. Vérifiez votre connexion internet et que .env.local contient NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY, puis redémarrez le serveur (npm run dev)."
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Connexion"
      subtitle="Connectez-vous à votre espace"
      footer={<Link href="/" className="text-brand hover:underline">Retour à l&apos;accueil</Link>}
    >
      <form onSubmit={handleSubmit} data-testid="login-form" className="space-y-4">
        {error && <div className="rounded-[9px] bg-[#fee2e2] px-3 py-2 text-sm text-[#b91c1c]">{error}</div>}
        {success && <div className="rounded-[9px] bg-[#dcfce7] px-3 py-2 text-sm text-[#15803d]">{success}</div>}
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-ink">Email</label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-ink">Mot de passe</label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Connexion..." : "Se connecter"}
        </Button>
        <p className="text-center">
          <Link href="/forgot-password" className="text-sm font-medium text-brand hover:underline">Mot de passe oublié ?</Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-8 bg-canvas">
        <div className="text-subtle">Chargement...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
