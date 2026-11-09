import type { Metadata } from "next";
import Image from "next/image";
import { PublicSavForm } from "./PublicSavForm";

export const metadata: Metadata = {
  title: "Demande de SAV - RS Écologie",
  description: "Signalez un problème sur votre installation : notre équipe vous recontacte rapidement.",
};

// Page publique : un seul lien, identique pour tous les clients.
export default function DemandeSavPage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="RS ÉCOLOGIE" width={1024} height={1024} className="h-16 w-auto object-contain" priority />
        </div>

        <div className="mb-5 text-center">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Une panne ? Un problème ?</h1>
          <p className="mt-2 text-base text-body">
            Ce formulaire sert à signaler un problème sur votre installation. Décrivez la panne, ajoutez des photos si
            vous le pouvez : notre service après-vente reçoit votre demande et vous recontacte rapidement.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_10px_30px_rgba(16,24,40,.10)] sm:p-8">
          <PublicSavForm />
        </div>
      </div>
    </div>
  );
}
