/**
 * Lecture « sans IA » des factures fournisseurs dont le PDF contient du texte
 * (factures générées par un logiciel : Odoo, Sage, EBP…).
 *
 * Un même document peut contenir plusieurs factures à la suite : une page qui
 * porte un en-tête « Facture N° » ouvre une nouvelle facture, les pages
 * suivantes sans en-tête la complètent.
 */

import { normalizeDepartment, parseIsoDate, round2 } from "@/lib/supplier-invoices";

export interface ParsedLine {
  position: number;
  reference: string | null;
  description: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  is_comment: boolean;
}

export interface ParsedInvoice {
  start_page: number;
  end_page: number;
  is_credit_note: boolean;
  supplier_name: string | null;
  supplier_siret: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  delivery_date: string | null;
  order_reference: string | null;
  payment_terms: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  client_reference: string | null;
  client_name: string | null;
  client_department: string | null;
  description: string | null;
  lines: ParsedLine[];
}

/** SIRET de RS Ecologie : jamais le fournisseur. */
const OWN_SIRETS = ["92165306900010", "921653069"];
const OWN_NAME = /\bRS\s*ECOLOGIE\b/i;

const NUM = String.raw`-?\d{1,3}(?:[   ]\d{3})*(?:,\d+)?`;
const LINE_TAIL = new RegExp(String.raw`(${NUM})\s+(${NUM})\s+(${NUM})\s*€?\s*$`);

/** « 2 150,00 » → 2150 */
export function frNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[\s  €]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** « 12/11/2026 » → « 2026-11-12 » */
export function frDate(s: string | null | undefined): string | null {
  const m = s?.match(/(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  return m ? parseIsoDate(`${m[3]}-${m[2]}-${m[1]}`) : null;
}

const HEADER = /^\s*(Facture|Avoir|FACTURE|AVOIR)\s+(?:n[°o]\s*:?\s*)?([A-Z0-9][A-Z0-9/_.-]{2,})\s*$/m;

function valueAfter(text: string, label: RegExp): string | null {
  const m = text.match(new RegExp(String.raw`${label.source}\s*:?\s*\n?\s*([^\n]+)`, "im"));
  return m ? m[1].trim() : null;
}

/** Montant en fin de ligne après un libellé (« Total 7 480,32 € »). */
function amountAfter(text: string, label: RegExp): number | null {
  const m = text.match(new RegExp(String.raw`^\s*${label.source}[^\n\d-]*?(${NUM})\s*€?\s*$`, "im"));
  return m ? frNumber(m[1]) : null;
}

/**
 * Nom du fournisseur : forme juridique en pied de page (« SAS DASTSOLUTION »),
 * sinon domaine de l'adresse e-mail.
 */
function detectSupplier(text: string): string | null {
  for (const m of text.matchAll(/^\s*(?:SAS|SASU|SARL|EURL|SA|SNC|SCOP)\s+([A-Z0-9][^\n]{1,60})$/gm)) {
    const name = m[1].trim();
    if (/capital|au\s+capital/i.test(name) || OWN_NAME.test(name)) continue;
    return name;
  }
  for (const m of text.matchAll(/^\s*([A-Z0-9][A-Z0-9 &'.-]{2,60})\s+(?:SAS|SASU|SARL|EURL|SA|SNC)\s*$/gm)) {
    if (!OWN_NAME.test(m[1])) return m[1].trim();
  }
  const mail = text.match(/[\w.+-]+@([\w-]+)\.[a-z]{2,}/i);
  if (mail && !/gmail|hotmail|outlook|yahoo|orange|free|wanadoo|rsecologie/i.test(mail[1])) return mail[1].toUpperCase();
  return null;
}

function detectSiret(text: string): string | null {
  for (const m of text.matchAll(/SIRE[TN]\s*:?\s*([\d ]{9,17})/gi)) {
    const v = m[1].replace(/\s/g, "");
    if (!OWN_SIRETS.some((o) => v.startsWith(o.slice(0, 9)))) return v;
  }
  return null;
}

const CLIENT_STOP = new Set(["chez", "a", "à", "livrer", "kit", "triphase", "monophase", "annule", "annulee", "annulée", "sans", "avec", "pour", "pac"]);

/**
 * Référence client écrite en commentaire (« CLIENT BAROUDI 60 », « client ben ali 92 »,
 * « GROMFLED 57 »). Retourne null si le commentaire n'en est pas une.
 */
export function parseClientReference(comment: string): { name: string | null; department: string | null } | null {
  const text = comment.replace(/[—–]/g, " - ").replace(/\s+/g, " ").trim();
  const idx = text.search(/\bclient\b/i);
  let rest: string;
  if (idx >= 0) {
    rest = text.slice(idx).replace(/^client\s*:?\s*/i, "");
  } else if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]*\s+(\d{2}|2A|2B)\b/.test(text)) {
    rest = text;
  } else {
    return null;
  }
  const words = rest.split(" ");
  const name: string[] = [];
  let department: string | null = null;
  for (const w of words) {
    if (/^(\d{2}|2A|2B)$/i.test(w)) {
      department = normalizeDepartment(w);
      break;
    }
    if (/\d/.test(w) || w === "-" || CLIENT_STOP.has(w.toLowerCase()) || name.length >= 3) break;
    name.push(w);
  }
  return { name: name.length ? name.join(" ") : null, department };
}

/** Découpe les lignes « #n [réf] désignation qté prix montant ». */
export function parseLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  const rows = text.split("\n");
  let buf: string[] | null = null;
  let pos = 0;

  const flush = (asComment: boolean) => {
    if (!buf) return;
    const first = buf[0].replace(/^#\d+\s*/, "").trim();
    if (asComment) {
      if (first) lines.push({ position: pos, reference: null, description: first, quantity: null, unit_price: null, amount: null, is_comment: true });
    }
    buf = null;
  };

  for (const raw of rows) {
    const row = raw.trim();
    const start = row.match(/^#(\d+)\s+(.*)$/);
    if (start) {
      flush(true);
      pos = Number(start[1]);
      buf = [row];
    } else if (buf) {
      buf.push(row);
    } else {
      continue;
    }
    const joined = buf.join(" ").replace(/\s+/g, " ");
    const tail = joined.match(LINE_TAIL);
    if (!tail) {
      // Une ligne sans montant qui s'étire trop : c'est un commentaire.
      if (buf.length > 4) flush(true);
      continue;
    }
    let body = joined.slice(0, tail.index).replace(/^#\d+\s*/, "").trim();
    let qty = frNumber(tail[1]);
    const pu = frNumber(tail[2]);
    const amount = frNumber(tail[3]);
    // « PACK 12 196,00 » : le séparateur de milliers a pu avaler un chiffre de la désignation.
    if (qty !== null && pu !== null && amount !== null && Math.abs(qty * pu - amount) > Math.max(0.05, Math.abs(amount) * 0.02)) {
      const parts = tail[1].split(/[   ]/);
      if (parts.length > 1) {
        const alt = frNumber(parts[parts.length - 1]);
        if (alt !== null && Math.abs(alt * pu - amount) <= Math.max(0.05, Math.abs(amount) * 0.02)) {
          body = `${body} ${parts.slice(0, -1).join(" ")}`.trim();
          qty = alt;
        }
      }
    }
    const ref = body.match(/^\[([^\]]+)\]\s*/);
    lines.push({
      position: pos,
      reference: ref ? ref[1].trim() : null,
      description: (ref ? body.slice(ref[0].length) : body).trim(),
      quantity: qty,
      unit_price: pu,
      amount,
      is_comment: false,
    });
    buf = null;
  }
  flush(true);
  return lines.sort((a, b) => a.position - b.position);
}

function summarize(lines: ParsedLine[]): string | null {
  const items = lines
    .filter((l) => !l.is_comment && (l.amount ?? 0) > 0)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  if (items.length === 0) return null;
  const main = items[0].description.split(/\s+/).slice(0, 8).join(" ");
  return items.length > 1 ? `${main} + ${items.length - 1} autre(s) article(s)` : main;
}

function parseOne(text: string, start: number, end: number): ParsedInvoice {
  const header = text.match(HEADER);
  const lines = parseLines(text);
  const ht = amountAfter(text, /(?:Montant|Total)\s+(?:hors\s+taxes|HT)/);
  let tva: number | null = null;
  for (const m of text.matchAll(new RegExp(String.raw`^\s*(?:Montant\s+)?TVA[^\n]*?(${NUM})\s*€\s*$`, "gim"))) {
    tva = round2((tva ?? 0) + (frNumber(m[1]) ?? 0));
  }
  let ttc =
    amountAfter(text, /Total\s+TTC/) ?? amountAfter(text, /Net\s+[àa]\s+payer/) ?? amountAfter(text, /Total(?!\s*(?:HT|hors|TVA))/);
  if (ttc === null && ht !== null) ttc = round2(ht + (tva ?? 0));

  const comments = lines.filter((l) => l.is_comment);
  let client: { name: string | null; department: string | null } | null = null;
  let clientRef: string | null = null;
  for (const c of comments) {
    const parsed = parseClientReference(c.description);
    if (parsed) {
      client = parsed;
      clientRef = c.description;
      break;
    }
  }

  const supplier = detectSupplier(text);
  return {
    start_page: start,
    end_page: end,
    is_credit_note: /^avoir$/i.test(header?.[1] ?? ""),
    supplier_name: supplier,
    supplier_siret: detectSiret(text),
    invoice_number: header?.[2] ?? null,
    invoice_date: frDate(valueAfter(text, /Date\s+de\s+(?:la\s+)?facture/)),
    due_date: frDate(valueAfter(text, /Date\s+d['’]\s*[ée]ch[ée]ance/)),
    delivery_date: frDate(valueAfter(text, /Date\s+de\s+livraison/)),
    order_reference: valueAfter(text, /^\s*Source/m) ?? valueAfter(text, /^\s*R[ée]f[ée]rence/m),
    payment_terms: valueAfter(text, /Conditions\s+de\s+paiement/),
    amount_ht: ht,
    amount_tva: tva,
    amount_ttc: ttc,
    client_reference: clientRef,
    client_name: client?.name ?? null,
    client_department: client?.department ?? null,
    description: summarize(lines),
    lines,
  };
}

/**
 * Découpe un document en factures d'après le texte de ses pages.
 * Retourne [] si le texte ne ressemble pas à des factures lisibles.
 */
export function parseInvoicesFromText(pages: string[]): ParsedInvoice[] {
  const groups: { start: number; end: number; text: string[] }[] = [];
  pages.forEach((page, i) => {
    const pageNo = i + 1;
    const pageOf = page.match(/Page\s*:?\s*(\d+)\s*\/\s*(\d+)/i);
    const startsNew = HEADER.test(page) || (pageOf ? pageOf[1] === "1" : false) || groups.length === 0;
    if (startsNew) groups.push({ start: pageNo, end: pageNo, text: [page] });
    else {
      const g = groups[groups.length - 1];
      g.end = pageNo;
      g.text.push(page);
    }
  });
  return groups
    .map((g) => parseOne(g.text.join("\n"), g.start, g.end))
    .filter((inv) => inv.invoice_number !== null || inv.amount_ttc !== null);
}

/** Le résultat est-il assez fiable pour se passer de l'IA ? */
export function isReliable(invoices: ParsedInvoice[]): boolean {
  if (invoices.length === 0) return false;
  return invoices.every((inv) => {
    if (!inv.invoice_number || inv.amount_ttc === null || !inv.invoice_date || !inv.supplier_name) return false;
    const items = inv.lines.filter((l) => !l.is_comment);
    // Si des lignes ont été lues, leur somme doit retomber sur le HT.
    if (items.length > 0 && inv.amount_ht !== null) {
      const sum = items.reduce((n, l) => n + (l.amount ?? 0), 0);
      if (Math.abs(sum - inv.amount_ht) > 1) return false;
    }
    return true;
  });
}
