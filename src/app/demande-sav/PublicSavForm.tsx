"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { SavForm } from "@/components/sav/SavForm";

export function PublicSavForm() {
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="py-6 text-center" role="status">
        <CheckCircle2 className="mx-auto h-14 w-14 text-[#16a34a]" />
        <h2 className="mt-4 text-xl font-bold text-ink">Votre demande a bien été envoyée</h2>
        <p className="mt-2 text-body">Notre équipe SAV l&apos;a reçue et vous recontactera très prochainement.</p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-6 min-h-11 rounded-xl border border-line-strong px-5 text-sm font-medium text-ink hover:bg-canvas"
        >
          Envoyer une autre demande
        </button>
      </div>
    );
  }

  return <SavForm endpoint="/api/sav/public" onSuccess={() => setSent(true)} />;
}
