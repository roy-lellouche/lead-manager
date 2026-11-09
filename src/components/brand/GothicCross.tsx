import { useId } from "react";

/**
 * Croix gothique ornée (croix « boutonnée », dessin original) en argent chromé,
 * avec un rubis au centre. Emblème de l'interface.
 */
export function GothicCross({ className = "w-6 h-6", title, gem = true }: { className?: string; title?: string; gem?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={`silver-${id}`} gradientUnits="userSpaceOnUse" x1="10" y1="5" x2="90" y2="95">
          <stop offset="0%" stopColor="#a3a9b1" />
          <stop offset="30%" stopColor="#3f444c" />
          <stop offset="50%" stopColor="#d3d7dc" />
          <stop offset="72%" stopColor="#4b5058" />
          <stop offset="100%" stopColor="#8a9098" />
        </linearGradient>
        <radialGradient id={`ruby-${id}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#ff7a93" />
          <stop offset="45%" stopColor="#d1123f" />
          <stop offset="100%" stopColor="#7a0a24" />
        </radialGradient>
      </defs>
      <g fill={`url(#silver-${id})`}>
        <rect x="44.5" y="13" width="11" height="74" rx="2" />
        <rect x="13" y="34.5" width="74" height="11" rx="2" />
        <circle cx="50" cy="9" r="6.2" />
        <circle cx="57.0" cy="15.0" r="4.6" />
        <circle cx="43.0" cy="15.0" r="4.6" />
        <circle cx="50" cy="91" r="6.2" />
        <circle cx="43.0" cy="85.0" r="4.6" />
        <circle cx="57.0" cy="85.0" r="4.6" />
        <circle cx="9" cy="40" r="6.2" />
        <circle cx="15.0" cy="33.0" r="4.6" />
        <circle cx="15.0" cy="47.0" r="4.6" />
        <circle cx="91" cy="40" r="6.2" />
        <circle cx="85.0" cy="47.0" r="4.6" />
        <circle cx="85.0" cy="33.0" r="4.6" />
        <path d="M50 27 L63 40 L50 53 L37 40 Z" />
      </g>
      {gem ? <circle cx="50" cy="40" r="5.5" fill={`url(#ruby-${id})`} stroke="#e5e7eb" strokeWidth="1.2" /> : null}
    </svg>
  );
}
