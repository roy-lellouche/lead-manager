import { useId } from "react";

/** Fleur de lys dessinée en SVG, remplie d'un dégradé argent « chromé ». */
export function FleurDeLis({ className = "w-6 h-6", title }: { className?: string; title?: string }) {
  const gradientId = `chrome-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="30%" stopColor="#bfc3c9" />
          <stop offset="50%" stopColor="#6f747b" />
          <stop offset="70%" stopColor="#e6e8eb" />
          <stop offset="100%" stopColor="#8a8f96" />
        </linearGradient>
      </defs>
      <path fill={`url(#${gradientId})`} d={FLEUR_DE_LIS_PATH} />
    </svg>
  );
}

export const FLEUR_DE_LIS_PATH =
  "M50 4C61 18 64 34 50 56C36 34 39 18 50 4Z" +
  "M55 54C59 36 77 26 89 36C97 43 94 58 82 58C88 50 83 41 74 44C66 47 61 54 58 60Z" +
  "M45 54C41 36 23 26 11 36C3 43 6 58 18 58C12 50 17 41 26 44C34 47 39 54 42 60Z" +
  "M32 58H68V66H32Z" +
  "M45 66H55L53 79C59 81 64 87 62 95C58 90 54 87 50 87C46 87 42 90 38 95C36 87 41 81 47 79Z";
