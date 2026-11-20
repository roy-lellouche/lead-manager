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
  /** Code postal du chantier quand la facture donne son adresse (aide au rapprochement). */
  client_postal_code?: string | null;
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

const MONTHS: [RegExp, string][] = [
  [/^janv/, "01"], [/^f[ée]v/, "02"], [/^mars/, "03"], [/^avr/, "04"], [/^mai/, "05"], [/^juin/, "06"],
  [/^juil/, "07"], [/^ao[uû]/, "08"], [/^sept/, "09"], [/^oct/, "10"], [/^nov/, "11"], [/^d[ée]c/, "12"],
];

/** « 12/11/2026 » ou « 02 nov. 2026 » → « 2026-11-12 » */
export function frDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return parseIsoDate(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  const t = s.match(/(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{4})/);
  if (!t) return null;
  const month = MONTHS.find(([re]) => re.test(t[2].toLowerCase()))?.[1];
  return month ? parseIsoDate(`${t[3]}-${month}-${t[1].padStart(2, "0")}`) : null;
}

/** En-tête « Facture FC26-7212 » (une ligne). */
const HEADER = /^\s*(Facture|Avoir|FACTURE|AVOIR)\s+(?:n[°o]\.?\s*:?\s*)?([A-Z0-9][A-Z0-9/_.-]{2,})\s*$/m;
/** Numéro sur sa propre ligne : « Numéro F-2026-1447 », « N° de facture : 123 », « Facture n° 45 ». */
const NUMBER_LINE = /^\s*(?:Num[ée]ro(?:\s+de\s+facture)?|N[°o]\.?\s*de\s*facture|Facture\s*n[°o]\.?|R[ée]f[ée]rence\s+facture)\s*:?\s*([A-Z0-9][A-Z0-9/_.-]{2,})\s*$/im;

/** Numéro de facture d'une page, quelle que soit sa présentation. */
export function detectInvoiceNumber(text: string): string | null {
  const candidates = [text.match(HEADER)?.[2], text.match(NUMBER_LINE)?.[1]];
  return candidates.find((c): c is string => !!c && /\d/.test(c)) ?? null;
}

/**
 * Première date qui suit un libellé (sur la même ligne ou les deux suivantes) :
 * résiste aux libellés répétés (« Date de la facture :Date de la facture : »).
 */
function dateAfter(text: string, label: RegExp): string | null {
  const re = new RegExp(label.source, "gi");
  for (const m of text.matchAll(re)) {
    const after = text.slice((m.index ?? 0) + m[0].length).split("\n").slice(0, 3).join("\n");
    const d = frDate(after);
    if (d) return d;
  }
  return null;
}

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
  // « Envoyée par / Émis par / Vendeur » suivi du nom.
  const sender = text.match(/^\s*(?:Envoy[ée]e?\s+par|[ÉE]mise?\s+par|[ÉE]metteur|Vendeur|Fournisseur)\s*:?\s*\n?\s*([^\n]{2,60})$/im);
  if (sender && !OWN_NAME.test(sender[1]) && /[A-Za-z]/.test(sender[1])) return sender[1].trim();
  // Pied de page « ECO KLIM | SAS, société… »
  const footer = text.match(/^\s*([A-Z0-9][^\n|]{1,60}?)\s*\|\s*(?:SAS|SASU|SARL|EURL|SA|SNC|SCOP)\b/m);
  if (footer && !OWN_NAME.test(footer[1])) return footer[1].trim();
  for (const m of text.matchAll(/^\s*(?:SAS|SASU|SARL|EURL|SA|SNC|SCOP)\s+([A-Z0-9][^\n]{1,60})$/gm)) {
    const name = m[1].trim();
    if (/capital|au\s+capital/i.test(name) || OWN_NAME.test(name)) continue;
    return name;
  }
  for (const m of text.matchAll(/^\s*([A-Z0-9][A-Z0-9 &'.-]{2,60})\s+(?:SAS|SASU|SARL|EURL|SA|SNC)\s*$/gm)) {
    if (!OWN_NAME.test(m[1])) return m[1].trim();
  }
  // Pied de page « DAVITECH -27 rue du 19 mars 1962, 93220 Gagny »
  for (const m of text.matchAll(/^[ \t]*([A-Z][A-Z0-9&'.]*(?:[ \t][A-Z0-9&'.]+){0,3})[ \t]+-[ \t]*\d{1,4}[ \t]/gm)) {
    if (!OWN_NAME.test(m[1]) && !GENERIC_LINE.test(m[1])) return m[1].trim();
  }
  // « … de la société DAVITECH »
  const company = text.match(/\bsoci[ée]t[ée][ \t]+([A-Z][A-Z0-9&'.-]{2,}(?:[ \t][A-Z][A-Z0-9&'.-]+){0,2})\b/);
  if (company && !OWN_NAME.test(company[1])) return company[1].trim();
  const mails = [...text.matchAll(/([\w.+-]+)@([\w-]+)\.[a-z]{2,}/gi)].filter((m) => !/rsecologie/i.test(m[0]));
  for (const m of mails) {
    if (!GENERIC_MAIL.test(m[2])) return m[2].toUpperCase();
  }
  // Adresse gmail : le nom est souvent dans la partie avant @ (contact.davitech, ecoklim.compta).
  for (const m of mails) {
    const name = m[1]
      .split(/[._+-]/)
      .filter((w) => w.length >= 3 && !/^(contact|compta|comptabilite|info|infos|facturation|factures?|admin|direction|commercial|bonjour|hello|sav|devis|\d+)$/i.test(w))
      .join(" ");
    if (name) return name.toUpperCase();
  }
  return null;
}

const GENERIC_MAIL = /^(gmail|hotmail|outlook|yahoo|orange|free|wanadoo|sfr|laposte|icloud|live|msn|aol|neuf|bbox)$/i;
const GENERIC_LINE = /^(FRANCE|TVA|SIRET|SIREN|RCS|APE|IBAN|BIC|TEL|PAGE|TOTAL)$/i;

function detectSiret(text: string): string | null {
  for (const m of text.matchAll(/SIRE[TN]\s*:?\s*(\d{3}[ .]?\d{3}[ .]?\d{3}(?:[ .]?\d{5})?)(?!\d)/gi)) {
    const v = m[1].replace(/[\s.]/g, "");
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

const TABLE_HEADER = /^\s*(?:Produits?|D[ée]signation|Description|Libell[ée]|Articles?|Prestations?)\b.*\b(?:Quantit[ée]|Qt[ée]|Qté)/i;
const TABLE_END = /^\s*(?:D[ée]tails?\s+TVA|R[ée]capitulatif|Total\s+HT|Sous[- ]total|Montant\s+hors\s+taxes|Conditions|Paiement|Taux\s+Montant)/i;
const TABLE_ROW = new RegExp(
  String.raw`^(.+?)\s+(${NUM})\s*(?:[A-Za-zÀ-ÿ.]{1,10}\s+)?(${NUM})\s*€?\s+(?:(?:Aucune|Exon[ée]r[ée]e?|N\/A|(?:TVA\s*)?\d+(?:[,.]\d+)?\s*%)\s+)?(${NUM})\s*€?\s*$`
);

/**
 * Lignes d'un tableau classique sans numéro de ligne :
 * « INSTALLATION PAC 1 unité 2 600,00 € Aucune 2 600,00 € ».
 */
export function parseTableLines(text: string): ParsedLine[] {
  const rows = text.split("\n").map((r) => r.trim());
  const out: ParsedLine[] = [];
  let inTable = false;
  for (const row of rows) {
    if (TABLE_HEADER.test(row)) {
      inTable = true;
      continue;
    }
    if (!inTable || !row) continue;
    if (TABLE_END.test(row)) {
      inTable = false;
      continue;
    }
    const m = row.match(TABLE_ROW);
    const qty = m ? frNumber(m[2]) : null;
    const pu = m ? frNumber(m[3]) : null;
    const amount = m ? frNumber(m[4]) : null;
    const coherent = m && qty !== null && pu !== null && amount !== null && Math.abs(qty * pu - amount) <= Math.max(0.05, Math.abs(amount) * 0.02);
    if (m && (coherent || /€/.test(row))) {
      const ref = m[1].match(/^\[([^\]]+)\]\s*/);
      out.push({
        position: out.length + 1,
        reference: ref ? ref[1].trim() : null,
        description: (ref ? m[1].slice(ref[0].length) : m[1]).trim(),
        quantity: qty,
        unit_price: pu,
        amount,
        is_comment: false,
      });
    } else if (/\bclient\b/i.test(row) || /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' -]{1,40}\s+(\d{2}|2A|2B)$/.test(row)) {
      // Référence client glissée entre deux lignes (« LAFON 81 », « CLIENT DUPONT »).
      out.push({ position: out.length + 1, reference: null, description: row, quantity: null, unit_price: null, amount: null, is_comment: true });
    } else if (out.length > 0 && !out[out.length - 1].is_comment) {
      // Suite de la désignation précédente (« AVEC ACCESSOIRES »).
      out[out.length - 1].description = `${out[out.length - 1].description} ${row}`.trim();
    } else {
      out.push({ position: out.length + 1, reference: null, description: row, quantity: null, unit_price: null, amount: null, is_comment: true });
    }
  }
  return out;
}

const OWN_IDENTITY = /FR\s*21\s*921\s*653\s*069|921\s*653\s*069|rsecologie|RS\s*ECOLOGIE|IMPASSE\s+DES\s+IFS|95200\s+SARCELLES/i;
const NOT_A_CLIENT = /facture|date|source|r[ée]f[ée]rence|num[ée]ro|[ée]ch[ée]ance|commande|page|tva|siret|siren|t[ée]l|e-?mail|@|produits|d[ée]signation|quantit/i;

/**
 * Client final quand la facture donne nom + adresse du chantier juste après
 * le bloc destinataire RS Ecologie (« LAMI / 58 All. des Plantes, 54690 Eulmont »),
 * ou après un libellé « Adresse du chantier / d'intervention ».
 */
export function detectSiteClient(text: string): { reference: string; name: string; department: string | null; postal: string | null } | null {
  const make = (name: string, address: string) => {
    const postal = address.match(/\b(\d{5})\b/)?.[1] ?? null;
    const dep = postal ? (postal.startsWith("97") ? postal.slice(0, 3) : postal.slice(0, 2)) : null;
    return { reference: address ? `${name} — ${address}` : name, name, department: dep === "20" ? null : normalizeDepartment(dep), postal };
  };
  const labelled = text.match(/^\s*(?:Adresse\s+(?:du\s+chantier|d['’]intervention|des\s+travaux|de\s+livraison)|Chantier|Client\s+final|Lieu\s+d['’]intervention)\s*:?\s*\n?\s*([^\n]+)(?:\n\s*([^\n]*\d{5}[^\n]*))?/im);
  if (labelled) {
    const first = labelled[1].trim();
    if (/\d{5}/.test(first) && !labelled[2]) return make(first.split(",")[0].trim(), first);
    return make(first, (labelled[2] ?? "").trim());
  }
  const rows = text.split("\n").map((r) => r.trim());
  const headerIdx = rows.findIndex((r) => TABLE_HEADER.test(r));
  if (headerIdx < 0) return null;
  let lastOwn = -1;
  for (let i = 0; i < headerIdx; i++) if (OWN_IDENTITY.test(rows[i])) lastOwn = i;
  if (lastOwn < 0) return null;
  const block = rows.slice(lastOwn + 1, headerIdx).filter(Boolean);
  if (block.length === 0 || block.length > 4 || block.some((r) => NOT_A_CLIENT.test(r))) return null;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(block[0]) || /\d{5}/.test(block[0])) return null;
  return make(block[0], block.slice(1).join(", "));
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
  const numbered = parseLines(text);
  const lines = numbered.some((l) => !l.is_comment) ? numbered : parseTableLines(text);
  const ht = amountAfter(text, /(?:Montant|Total)\s+(?:hors\s+taxes|HT)/);
  let tva: number | null = null;
  const totalTva = amountAfter(text, /(?:Total|Montant)\s+(?:de\s+(?:la\s+)?)?TVA/);
  if (totalTva !== null) tva = totalTva;
  else
    for (const m of text.matchAll(new RegExp(String.raw`^\s*TVA[^\n]*?(${NUM})\s*€\s*$`, "gim"))) {
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
  let clientPostal: string | null = null;
  if (!client) {
    const site = detectSiteClient(text);
    if (site) {
      client = { name: site.name, department: site.department };
      clientRef = site.reference;
      clientPostal = site.postal;
    }
  }

  const supplier = detectSupplier(text);
  return {
    start_page: start,
    end_page: end,
    is_credit_note: /^avoir$/i.test(header?.[1] ?? "") || /^\s*Avoir\s*$/im.test(text),
    supplier_name: supplier,
    supplier_siret: detectSiret(text),
    invoice_number: detectInvoiceNumber(text),
    invoice_date:
      dateAfter(text, /Date\s+de\s+(?:la\s+)?facture/) ?? dateAfter(text, /Date\s+d['’]\s*[ée]mission/) ?? dateAfter(text, /^\s*Date\b/m),
    due_date: dateAfter(text, /Date\s+d['’]\s*[ée]ch[ée]ance/),
    delivery_date: dateAfter(text, /Date\s+de\s+livraison/),
    order_reference: valueAfter(text, /^\s*Source/m) ?? valueAfter(text, /^\s*R[ée]f[ée]rence(?:\s+commande)?(?=\s|:)/m),
    payment_terms: valueAfter(text, /Conditions\s+de\s+paiement/),
    amount_ht: ht,
    amount_tva: tva,
    amount_ttc: ttc,
    client_reference: clientRef,
    client_name: client?.name ?? null,
    client_department: client?.department ?? null,
    client_postal_code: clientPostal,
    description: summarize(lines),
    lines,
  };
}

/**
 * Découpe un document en factures d'après le texte de ses pages.
 * Retourne [] si le texte ne ressemble pas à des factures lisibles.
 */
export function parseInvoicesFromText(pages: string[]): ParsedInvoice[] {
  const groups: { start: number; end: number; number: string | null; text: string[] }[] = [];
  pages.forEach((page, i) => {
    const pageNo = i + 1;
    const number = detectInvoiceNumber(page);
    const current = groups[groups.length - 1];
    // Une nouvelle facture commence quand un numéro apparaît et diffère de celui en cours
    // (une facture de plusieurs pages répète souvent son numéro).
    const startsNew = !current || (number !== null && number !== current.number) || (number === null && current.number === null && /\bPage\s*:?\s*1\s*\/\s*\d+/i.test(page));
    if (startsNew) groups.push({ start: pageNo, end: pageNo, number, text: [page] });
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
