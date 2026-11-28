/**
 * Export « photo » (PNG) du planning d'un jour, dessiné côté navigateur sur un
 * canvas : pratique pour l'envoyer aux équipes (WhatsApp, SMS…).
 */
import { STOCK_STATUS_LABELS, TEAMS, compareInstallations, formatTime, type StockStatus, type TeamId, type TeamInstallation } from "@/lib/equipe";

const W = 900;
const PAD = 32;
const CONTENT_W = W - PAD * 2;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const TEAM_HEX: Record<TeamId, string> = { 1: "#0ea5e9", 2: "#8b5cf6", 3: "#f59e0b", 4: "#10b981" };
const STATUS_HEX: Record<StockStatus, string> = { stock: "#16a34a", a_commander: "#dc2626", commande: "#ea580c" };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function dayLabelFr(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const s = new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Op = (ctx: CanvasRenderingContext2D) => void;

export async function buildDayPlanningImage(opts: {
  date: string;
  items: TeamInstallation[];
  team?: TeamId | null;
  notes?: Partial<Record<number, string>>;
}): Promise<Blob> {
  // 1re passe : mesure et liste d'opérations ; 2e passe : dessin à la bonne hauteur.
  const measure = document.createElement("canvas").getContext("2d")!;
  const ops: Op[] = [];
  let y = PAD;

  const setFont = (ctx: CanvasRenderingContext2D, size: number, weight = 400) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
  };

  const title = `Planning des équipes — ${dayLabelFr(opts.date)}`;
  {
    const ty = y;
    ops.push((ctx) => {
      setFont(ctx, 26, 700);
      ctx.fillStyle = "#0f172a";
      ctx.fillText(title, PAD, ty + 26);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(PAD, ty + 40, CONTENT_W, 2);
    });
    y += 60;
  }

  const teams = opts.team ? TEAMS.filter((t) => t.id === opts.team) : TEAMS;
  for (const t of teams) {
    const list = opts.items.filter((i) => i.team === t.id).sort(compareInstallations);
    const hy = y;
    ops.push((ctx) => {
      ctx.fillStyle = TEAM_HEX[t.id];
      ctx.beginPath();
      ctx.roundRect(PAD, hy, CONTENT_W, 40, 10);
      ctx.fill();
      setFont(ctx, 19, 700);
      ctx.fillStyle = "#fff";
      ctx.fillText(`Équipe ${t.id} — ${t.name}`, PAD + 14, hy + 27);
      setFont(ctx, 15, 500);
      const c = `${list.length} installation${list.length > 1 ? "s" : ""}`;
      ctx.fillText(c, PAD + CONTENT_W - 14 - ctx.measureText(c).width, hy + 26);
    });
    y += 52;

    const note = opts.notes?.[t.id]?.trim();
    if (note) {
      setFont(measure, 15, 400);
      const lines = wrap(measure, note, CONTENT_W - 40);
      const nh = 16 + 22 + lines.length * 21 + 6;
      const ny = y;
      ops.push((ctx) => {
        ctx.fillStyle = "#fefce8";
        ctx.strokeStyle = "#fde68a";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, ny, CONTENT_W, nh, 10);
        ctx.fill();
        ctx.stroke();
        setFont(ctx, 15, 700);
        ctx.fillStyle = "#854d0e";
        ctx.fillText("Note du jour", PAD + 20, ny + 28);
        setFont(ctx, 15, 400);
        ctx.fillStyle = "#0f172a";
        let ly = ny + 28 + 24;
        for (const line of lines) {
          ctx.fillText(line, PAD + 20, ly);
          ly += 21;
        }
      });
      y += nh + 12;
    }

    if (list.length === 0) {
      const ey = y;
      ops.push((ctx) => {
        setFont(ctx, 15, 400);
        ctx.fillStyle = "#64748b";
        ctx.fillText("Aucune installation prévue.", PAD + 14, ey + 14);
      });
      y += 36;
      continue;
    }

    for (const it of list) {
      const rows: { label: string; value: string; color?: string; bold?: boolean }[] = [];
      if (it.phone) rows.push({ label: "Téléphone", value: it.phone });
      if (it.address) rows.push({ label: "Adresse", value: it.address });
      if (it.product_label)
        rows.push({ label: "Pompe à chaleur", value: `${it.quantity > 1 ? `${it.quantity} × ` : ""}${it.product_label}` });
      rows.push({ label: "Matériel", value: STOCK_STATUS_LABELS[it.stock_status], color: STATUS_HEX[it.stock_status], bold: true });
      if (it.notes) rows.push({ label: "Notes", value: it.notes });

      const labelW = 150;
      const valueW = CONTENT_W - 36 - labelW;
      setFont(measure, 15, 400);
      const wrapped = rows.map((r) => ({ ...r, lines: wrap(measure, r.value, valueW) }));
      const lineH = 21;
      const blockH = 18 + 26 + wrapped.reduce((s, r) => s + r.lines.length * lineH, 0) + 12;
      const by = y;
      ops.push((ctx) => {
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(PAD, by, CONTENT_W, blockH, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = STATUS_HEX[it.stock_status];
        ctx.beginPath();
        ctx.roundRect(PAD, by, 6, blockH, [10, 0, 0, 10]);
        ctx.fill();

        setFont(ctx, 19, 700);
        ctx.fillStyle = "#0f172a";
        ctx.fillText(`${it.start_time ? `${formatTime(it.start_time)} · ` : ""}${it.client_name}`, PAD + 20, by + 34);
        let ly = by + 18 + 26 + 18;
        for (const r of wrapped) {
          setFont(ctx, 15, 600);
          ctx.fillStyle = "#64748b";
          ctx.fillText(`${r.label} :`, PAD + 20, ly);
          setFont(ctx, 15, r.bold ? 700 : 400);
          ctx.fillStyle = r.color ?? "#0f172a";
          for (const line of r.lines) {
            ctx.fillText(line, PAD + 20 + labelW, ly);
            ly += lineH;
          }
        }
      });
      y += blockH + 12;
    }
    y += 8;
  }

  const height = Math.ceil(y + PAD - 12);
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, height);
  ctx.textBaseline = "alphabetic";
  for (const op of ops) op(ctx);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export image impossible."))), "image/png")
  );
}

/** Partage natif (mobile) si possible, sinon téléchargement du fichier. */
export async function shareOrDownload(blob: Blob, fileName: string, title: string): Promise<void> {
  const file = new File([blob], fileName, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const isTouch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (isTouch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
