import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { STOCK_STATUS_LABELS, TEAMS, compareInstallations, formatTime, type StockStatus, type TeamId, type TeamInstallation } from "@/lib/equipe";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

const TEAM_RGB: Record<TeamId, [number, number, number]> = {
  1: [0.05, 0.65, 0.91],
  2: [0.55, 0.36, 0.96],
  3: [0.96, 0.62, 0.04],
  4: [0.06, 0.73, 0.51],
};

const STATUS_RGB: Record<StockStatus, [number, number, number]> = {
  stock: [0.09, 0.64, 0.29],
  a_commander: [0.86, 0.15, 0.15],
  commande: [0.92, 0.45, 0.05],
};

/** Les polices standard PDF n'encodent que WinAnsi : on remplace le reste. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ")
    .replace(/\t/g, " ")
    .replace(/[^\n\x20-\x7E¡-ÿŒœŠšŸŽž€]/gu, (ch) =>
      // Lettre accentuée hors WinAnsi (ễ, ł…) : on garde la lettre de base ; le reste (emojis…) disparaît.
      ch.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "")
    );
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of toWinAnsi(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // Mot plus long que la ligne : on le coupe.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > maxWidth && w.length > 1) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxWidth) cut--;
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildDayPlanningPdf(opts: {
  date: string; // yyyy-MM-dd
  items: TeamInstallation[];
  team?: TeamId | null;
  notes?: Partial<Record<number, string>>;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [y0, m0, d0] = opts.date.split("-").map(Number);
  const dayLabel = new Date(Date.UTC(y0, m0 - 1, d0, 12)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const title = `Planning des équipes - ${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1)}`;
  doc.setTitle(toWinAnsi(title));

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (s: string, x: number, size: number, f: PDFFont = font, color = rgb(0.1, 0.12, 0.16)) => {
    page.drawText(toWinAnsi(s), { x, y, size, font: f, color });
  };

  const drawHeader = (continued: boolean) => {
    text(continued ? `${title} (suite)` : title, MARGIN, continued ? 11 : 16, bold);
    y -= continued ? 18 : 22;
    page.drawRectangle({ x: MARGIN, y, width: CONTENT_W, height: 1.5, color: rgb(0.85, 0.88, 0.92) });
    y -= 16;
  };

  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 20) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeader(true);
    }
  };

  drawHeader(false);

  const teams = opts.team ? TEAMS.filter((t) => t.id === opts.team) : TEAMS;
  for (const t of teams) {
    const list = opts.items.filter((i) => i.team === t.id).sort(compareInstallations);
    ensure(60);
    const [r, g, b] = TEAM_RGB[t.id];
    page.drawRectangle({ x: MARGIN, y: y - 6, width: CONTENT_W, height: 22, color: rgb(r, g, b) });
    text(`Équipe ${t.id} - ${t.name}`, MARGIN + 8, 12, bold, rgb(1, 1, 1));
    const countLabel = `${list.length} installation${list.length > 1 ? "s" : ""}`;
    page.drawText(countLabel, {
      x: MARGIN + CONTENT_W - 8 - font.widthOfTextAtSize(countLabel, 10),
      y,
      size: 10,
      font,
      color: rgb(1, 1, 1),
    });
    y -= 30;

    const note = opts.notes?.[t.id]?.trim();
    if (note) {
      const lines = wrap(note, font, 10, CONTENT_W - 24);
      const nh = 22 + lines.length * 13 + 6;
      ensure(nh);
      const top = y + 12;
      page.drawRectangle({
        x: MARGIN,
        y: top - nh,
        width: CONTENT_W,
        height: nh,
        color: rgb(1, 0.99, 0.91),
        borderColor: rgb(0.99, 0.9, 0.54),
        borderWidth: 1,
      });
      text("Note du jour", MARGIN + 12, 10, bold, rgb(0.52, 0.3, 0.05));
      y -= 16;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + 12, y, size: 10, font, color: rgb(0.1, 0.12, 0.16) });
        y -= 13;
      }
      y -= 14;
    }

    if (list.length === 0) {
      text("Aucune installation prévue.", MARGIN + 8, 10, font, rgb(0.45, 0.5, 0.56));
      y -= 24;
      continue;
    }

    for (const it of list) {
      const rows: { label: string; value: string }[] = [];
      if (it.phone) rows.push({ label: "Téléphone", value: it.phone });
      if (it.address) rows.push({ label: "Adresse", value: it.address });
      if (it.product_label)
        rows.push({ label: "Pompe à chaleur", value: `${it.quantity > 1 ? `${it.quantity} x ` : ""}${it.product_label}` });
      rows.push({ label: "Matériel", value: STOCK_STATUS_LABELS[it.stock_status] });
      if (it.notes) rows.push({ label: "Notes", value: it.notes });

      const labelW = 95;
      const valueW = CONTENT_W - 16 - labelW;
      const wrapped = rows.map((row) => ({ ...row, lines: wrap(row.value, font, 10, valueW) }));
      const blockH = 22 + wrapped.reduce((s, w) => s + w.lines.length * 13, 0) + 8;

      ensure(blockH);
      const top = y + 12;
      page.drawRectangle({
        x: MARGIN,
        y: top - blockH,
        width: CONTENT_W,
        height: blockH,
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 1,
        color: rgb(1, 1, 1),
      });
      const [sr, sg, sb] = STATUS_RGB[it.stock_status];
      page.drawRectangle({ x: MARGIN, y: top - blockH, width: 4, height: blockH, color: rgb(sr, sg, sb) });

      text(`${it.start_time ? `${formatTime(it.start_time)} - ` : ""}${it.client_name}`, MARGIN + 12, 12, bold);
      y -= 20;
      for (const w of wrapped) {
        text(`${w.label} :`, MARGIN + 12, 10, bold, rgb(0.35, 0.4, 0.46));
        w.lines.forEach((line, idx) => {
          const color = w.label === "Matériel" ? rgb(sr, sg, sb) : rgb(0.1, 0.12, 0.16);
          page.drawText(line, { x: MARGIN + 12 + labelW, y, size: 10, font: w.label === "Matériel" ? bold : font, color });
          if (idx < w.lines.length - 1) y -= 13;
        });
        y -= 13;
      }
      y -= 18;
    }
    y -= 6;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} / ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN - font.widthOfTextAtSize(label, 8),
      y: MARGIN / 2,
      size: 8,
      font,
      color: rgb(0.55, 0.6, 0.66),
    });
  });

  return doc.save();
}
