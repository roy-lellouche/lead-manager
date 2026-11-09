"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth/AuthShell";
import { cn } from "@/lib/utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    // window.location.origin : toujours le domaine réellement servi (prod, preview ou local).
    // Une URL en dur ou une variable d'env se désynchronise du domaine sans rien casser
    // visiblement — Supabase refuse alors la redirection et renvoie sur le Site URL.
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <AuthShell title="Email envoyé">
        <p className="mb-6 text-sm text-subtle">
          Si un compte existe avec l&apos;adresse <strong>{email}</strong>,
          vous recevrez un lien pour réinitialiser votre mot de passe.
          Vérifiez également votre dossier spam.
        </p>
        <Link href="/login" className={cn(buttonVariants(), "w-full justify-center")}>
          Retour à la connexion
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Mot de passe oublié"
      subtitle="Entrez votre email pour recevoir un lien de réinitialisation"
      footer={
        <Link href="/login" className="text-brand hover:underline">
          Retour à la connexion
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
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Envoi..." : "Envoyer le lien"}
        </Button>
      </form>
    </AuthShell>
  );
}
