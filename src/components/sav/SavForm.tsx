"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";
import { SAV_MAX_PHOTOS, SAV_PROBLEM_TYPES } from "@/lib/sav";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { INPUT_CLS, LABEL_CLS } from "./styles";

interface Props {
  /** Route d'envoi : publique pour le client, /api/admin/sav pour le personnel. */
  endpoint: string;
  /** Appelé avec la réponse JSON du serveur une fois la demande enregistrée. */
  onSuccess: (response: unknown) => void;
  submitLabel?: string;
}

interface PhotoItem {
  file: File;
  preview: string;
}

/** Formulaire SAV, partagé par la page publique client et l'espace interne (admin, secrétaire, stockage). */
export function SavForm({ endpoint, onSuccess, submitLabel = "Envoyer la demande" }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [problemType, setProblemType] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const addPhotos = async (list: FileList | null) => {
    if (!list?.length) return;
    const room = SAV_MAX_PHOTOS - photos.length;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, room);
    const compressed = await Promise.all(picked.map((f) => compressImage(f)));
    setPhotos((prev) => [...prev, ...compressed.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (fileInput.current) fileInput.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.preview));
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCoords(null);
    setProblemType("");
    setDescription("");
    setPhotos([]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("name", name);
      body.set("phone", phone);
      body.set("email", email);
      body.set("address", address);
      if (coords) {
        body.set("lat", String(coords.lat));
        body.set("lng", String(coords.lng));
      }
      body.set("problem_type", problemType);
      body.set("description", description);
      body.set("website", honeypot);
      photos.forEach((p) => body.append("photos", p.file));

      const res = await fetch(endpoint, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Une erreur est survenue, merci de réessayer.");
        return;
      }
      reset();
      onSuccess(json);
    } catch {
      setError("Connexion impossible. Vérifiez votre réseau et réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Champ piège anti-robots : invisible et hors du parcours clavier. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="sav-name" className={LABEL_CLS}>Nom <span className="text-red-600">*</span></label>
          <input id="sav-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="sav-phone" className={LABEL_CLS}>Téléphone <span className="text-red-600">*</span></label>
          <input id="sav-phone" required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={INPUT_CLS} />
        </div>
      </div>

      <div>
        <label htmlFor="sav-email" className={LABEL_CLS}>Email <span className="font-normal text-subtle">(facultatif)</span></label>
        <input id="sav-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT_CLS} />
      </div>

      <div>
        <label htmlFor="sav-address" className={LABEL_CLS}>Adresse de l&apos;intervention <span className="text-red-600">*</span></label>
        <AddressAutocomplete
          id="sav-address"
          required
          value={address}
          onChange={(a, c) => {
            setAddress(a);
            setCoords(c);
          }}
        />
      </div>

      <div>
        <label htmlFor="sav-type" className={LABEL_CLS}>Type de problème <span className="text-red-600">*</span></label>
        <select id="sav-type" required value={problemType} onChange={(e) => setProblemType(e.target.value)} className={INPUT_CLS}>
          <option value="" disabled>Choisir un type de problème…</option>
          {SAV_PROBLEM_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="sav-desc" className={LABEL_CLS}>Décrivez le problème <span className="text-red-600">*</span></label>
        <textarea
          id="sav-desc"
          required
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Que se passe-t-il ? Depuis quand ? Un message d'erreur s'affiche-t-il ?"
          className={`${INPUT_CLS} resize-y`}
        />
      </div>

      <div>
        <span className={LABEL_CLS}>Photos de la panne <span className="font-normal text-subtle">(facultatif)</span></span>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          id="sav-photos"
          onChange={(e) => void addPhotos(e.target.files)}
        />
        <div className="flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <div key={p.preview} className="relative h-24 w-24 overflow-hidden rounded-xl border border-line-strong">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label={`Retirer la photo ${i + 1}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < SAV_MAX_PHOTOS && (
            <label
              htmlFor="sav-photos"
              className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#b8c6dc] text-xs text-body hover:border-brand hover:text-brand"
            >
              <Camera className="h-6 w-6" />
              Ajouter
            </label>
          )}
        </div>
        <p className="mt-1.5 text-xs text-subtle">Jusqu&apos;à {SAV_MAX_PHOTOS} photos.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-base font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
      >
        {submitting && <Loader2 className="h-5 w-5 animate-spin" />}
        {submitting ? "Envoi en cours…" : submitLabel}
      </button>
    </form>
  );
}
