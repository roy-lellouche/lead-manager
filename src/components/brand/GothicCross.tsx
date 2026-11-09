import { useId } from "react";

/**
 * Croix fleurdelisée (motif héraldique : quatre fleurs de lys en croix, dessin original)
 * en argent chromé, avec un rubis serti au centre. Emblème de l'interface.
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
        <path transform="translate(50 50) rotate(0) translate(0 -9) scale(0.6) translate(-50 -66)" d="M50 4C61 18 64 34 50 56C36 34 39 18 50 4ZM55 54C59 36 77 26 89 36C97 43 94 58 82 58C88 50 83 41 74 44C66 47 61 54 58 60ZM45 54C41 36 23 26 11 36C3 43 6 58 18 58C12 50 17 41 26 44C34 47 39 54 42 60ZM32 58H68V66H32Z" />
        <path transform="translate(50 50) rotate(90) translate(0 -9) scale(0.6) translate(-50 -66)" d="M50 4C61 18 64 34 50 56C36 34 39 18 50 4ZM55 54C59 36 77 26 89 36C97 43 94 58 82 58C88 50 83 41 74 44C66 47 61 54 58 60ZM45 54C41 36 23 26 11 36C3 43 6 58 18 58C12 50 17 41 26 44C34 47 39 54 42 60ZM32 58H68V66H32Z" />
        <path transform="translate(50 50) rotate(180) translate(0 -9) scale(0.6) translate(-50 -66)" d="M50 4C61 18 64 34 50 56C36 34 39 18 50 4ZM55 54C59 36 77 26 89 36C97 43 94 58 82 58C88 50 83 41 74 44C66 47 61 54 58 60ZM45 54C41 36 23 26 11 36C3 43 6 58 18 58C12 50 17 41 26 44C34 47 39 54 42 60ZM32 58H68V66H32Z" />
        <path transform="translate(50 50) rotate(270) translate(0 -9) scale(0.6) translate(-50 -66)" d="M50 4C61 18 64 34 50 56C36 34 39 18 50 4ZM55 54C59 36 77 26 89 36C97 43 94 58 82 58C88 50 83 41 74 44C66 47 61 54 58 60ZM45 54C41 36 23 26 11 36C3 43 6 58 18 58C12 50 17 41 26 44C34 47 39 54 42 60ZM32 58H68V66H32Z" />
        <circle cx="50" cy="50" r="11" />
      </g>
      {gem ? <circle cx="50" cy="50" r="6.5" fill={`url(#ruby-${id})`} stroke="#e5e7eb" strokeWidth="1.2" /> : null}
    </svg>
  );
}
