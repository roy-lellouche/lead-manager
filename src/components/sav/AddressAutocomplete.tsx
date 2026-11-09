"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { INPUT_CLS } from "./styles";

interface Suggestion {
  id: string;
  label: string;
  lat?: number;
  lng?: number;
}

interface Props {
  value: string;
  onChange: (address: string, coords: { lat: number; lng: number } | null) => void;
  required?: boolean;
  id?: string;
}

/**
 * Champ d'adresse avec suggestions (Google Places via /api/sav/places, repli BAN).
 * Tant que l'utilisateur tape sans choisir, les coordonnées sont nulles : le
 * serveur géocodera l'adresse à l'enregistrement.
 */
export function AddressAutocomplete({ value, onChange, required, id }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    const requestId = ++requestRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sav/places/autocomplete?q=${encodeURIComponent(value.trim())}`);
        const json = await res.json();
        // Ignore les réponses d'une frappe déjà dépassée.
        if (requestId !== requestRef.current) return;
        setSuggestions(json.suggestions ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        if (requestId === requestRef.current) setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const choose = async (s: Suggestion) => {
    skipNextFetch.current = true;
    setOpen(false);
    setSuggestions([]);
    if (s.lat !== undefined && s.lng !== undefined) {
      onChange(s.label, { lat: s.lat, lng: s.lng });
      return;
    }
    onChange(s.label, null);
    try {
      const res = await fetch(`/api/sav/places/details?id=${encodeURIComponent(s.id)}`);
      if (res.ok) {
        const place = await res.json();
        onChange(s.label, { lat: place.lat, lng: place.lng });
      }
    } catch {
      /* le serveur géocodera à l'enregistrement */
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      void choose(suggestions[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        value={value}
        required={required}
        placeholder="Commencez à saisir l'adresse…"
        className={INPUT_CLS}
        onChange={(e) => onChange(e.target.value, null)}
        onFocus={() => suggestions.length && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-[0_10px_30px_rgba(16,24,40,.15)]"
        >
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown : se déclenche avant le blur de l'input, donc avant la fermeture de la liste.
                onMouseDown={(e) => {
                  e.preventDefault();
                  void choose(s);
                }}
                className={`flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm ${
                  i === active ? "bg-[#eef4ff]" : "hover:bg-canvas"
                }`}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
