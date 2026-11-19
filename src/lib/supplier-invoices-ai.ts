import { generateText, Output } from "ai";
import { z } from "zod";
import { normalizeDepartment, parseAmount, parseIsoDate, round2 } from "@/lib/supplier-invoices";

/**
 * Lecture automatique de factures fournisseurs par IA, via Vercel AI Gateway
 * (authentification OIDC automatique sur Vercel, ou AI_GATEWAY_API_KEY en local).
 *
 * Un même PDF peut regrouper plusieurs factures (relevé « Facture directe » d'un
 * fournisseur) : l'IA renvoie une entrée par facture avec ses pages.
 */

const MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";

/** Au-delà, le PDF est trop long pour une seule lecture : on demande de le découper. */
export const MAX_PDF_PAGES = 150;

const invoiceSchema = z.object({
  start_page: z.number().int().describe("Première page de cette facture dans le document (1 = première page)"),
  end_page: z.number().int().describe("Dernière page de cette facture dans le document"),
  is_credit_note: z.boolean().describe("true s'il s'agit d'un avoir"),
  supplier_name: z.string().nullable().describe("Raison sociale de l'ÉMETTEUR (le fournisseur), jamais RS Ecologie"),
  invoice_number: z.string().nullable().describe("Numéro de la facture"),
  invoice_date: z.string().nullable().describe("Date de facture YYYY-MM-DD"),
  due_date: z
    .string()
    .nullable()
    .describe("Date d'échéance YYYY-MM-DD. Si seule une condition est indiquée (ex. 30 jours fin de mois), calcule la date."),
  order_reference: z.string().nullable().describe("Référence de commande / bon de livraison / source, si présente"),
  amount_ht: z.number().nullable().describe("Total hors taxes en euros"),
  amount_tva: z.number().nullable().describe("Montant total de TVA en euros"),
  amount_ttc: z.number().nullable().describe("Total TTC / net à payer en euros (négatif pour un avoir)"),
  amount_already_paid: z.number().nullable().describe("Acompte ou montant déjà réglé indiqué sur la facture, sinon null"),
  client_reference: z
    .string()
    .nullable()
    .describe(
      "Texte EXACT désignant le client final / chantier de RS Ecologie, souvent une ligne de commentaire en tête des lignes (ex. « CLIENT BAROUDI 60 », « client ben ali 92 », « GROMFLED 57 »). null si la facture n'en mentionne aucun (matériel pour le stock)."
    ),
  client_name: z
    .string()
    .nullable()
    .describe("Nom de famille (et prénom s'il est écrit) du client final extrait de cette référence, sans « CLIENT », sans département ni remarque. Ex. « BAROUDI », « BEN ALI », « AMMAR NADIA »."),
  client_department: z
    .string()
    .nullable()
    .describe("Numéro de département du client s'il figure dans la référence (ex. « 60 », « 08 », « 2A »), sinon null"),
  description: z.string().nullable().describe("Résumé très court (max 80 caractères) du matériel facturé, ex. « PAC 9 kW + ballon 200 L »"),
});

const documentSchema = z.object({
  invoices: z.array(invoiceSchema).describe("Une entrée par facture ou avoir présent dans le document, dans l'ordre des pages"),
});

export type InvoiceExtraction = z.infer<typeof invoiceSchema>;

export interface ExtractedInvoiceFields {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  order_reference: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  amount_paid: number;
  description: string | null;
  client_reference: string | null;
  client_name: string | null;
  client_department: string | null;
  needs_review: boolean;
}

const PROMPT = `Tu lis un document de facturation fournisseur reçu par RS Ecologie, entreprise française de rénovation énergétique (pompes à chaleur, climatisation…).
Le document peut contenir UNE ou PLUSIEURS factures à la suite : repère chaque facture (numéro distinct) et ses pages. Une facture peut s'étendre sur plusieurs pages (« Page 1 / 2 »).
Règles :
- Le fournisseur est l'entreprise qui ÉMET la facture (en-tête, mentions légales), jamais RS Ecologie.
- Dates au format YYYY-MM-DD. Montants en nombres (point décimal), sans symbole.
- La référence client est le client final chez qui le matériel est installé : cherche une ligne de commentaire du type « CLIENT NOM 60 » parmi les lignes de facture. Une ligne de produit ou une remarque technique (ex. « 8 KIT SANS THERMOSTAT ») n'est PAS une référence client.
- Si une information est absente ou illisible, mets null ; n'invente rien.
- Si le TTC manque mais que HT et TVA sont présents, calcule-le.`;

/** Texte de chaque page d'un PDF (vide pour un scan sans couche texte). */
export async function pdfPageTexts(data: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

/**
 * Lit toutes les factures d'un document. Les PDF avec couche texte sont envoyés
 * en texte (plus rapide et moins cher) ; les scans et photos, en fichier.
 */
export async function extractInvoices(
  data: Uint8Array,
  mediaType: string,
  pageTexts: string[] | null
): Promise<InvoiceExtraction[]> {
  const textual =
    pageTexts && pageTexts.length > 0 && pageTexts.reduce((n, t) => n + t.trim().length, 0) / pageTexts.length >= 80;

  const content = textual
    ? [
        {
          type: "text" as const,
          text: `${PROMPT}\n\nDocument (${pageTexts!.length} pages) :\n\n${pageTexts!
            .map((t, i) => `=== PAGE ${i + 1} ===\n${t.trim()}`)
            .join("\n\n")}`,
        },
      ]
    : [
        { type: "text" as const, text: PROMPT },
        { type: "file" as const, mediaType, data },
      ];

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: documentSchema }),
    maxOutputTokens: 32000,
    messages: [{ role: "user", content }],
  });
  return output.invoices;
}

/** Nettoie la lecture IA d'une facture et indique si une vérification humaine s'impose. */
export function toInvoiceFields(x: InvoiceExtraction): ExtractedInvoiceFields {
  const ht = parseAmount(x.amount_ht);
  const tva = parseAmount(x.amount_tva);
  let ttc = parseAmount(x.amount_ttc);
  if (ttc === null && ht !== null) ttc = round2(ht + (tva ?? 0));
  const paid = Math.max(0, parseAmount(x.amount_already_paid) ?? 0);
  const supplier = x.supplier_name?.trim() || null;
  const invoiceDate = parseIsoDate(x.invoice_date);
  let dueDate = parseIsoDate(x.due_date);
  // Échéance absente : à réception, soit la date de facture.
  if (!dueDate && invoiceDate) dueDate = invoiceDate;
  const coherent = ht === null || ttc === null || Math.abs(ht + (tva ?? 0) - ttc) <= 1;
  const clientRef = x.client_reference?.trim() || null;
  return {
    supplier_name: supplier,
    invoice_number: x.invoice_number?.trim() || null,
    invoice_date: invoiceDate,
    due_date: dueDate,
    order_reference: x.order_reference?.trim() || null,
    amount_ht: ht,
    amount_tva: tva,
    amount_ttc: ttc,
    amount_paid: ttc !== null ? Math.min(paid, Math.max(ttc, 0)) : 0,
    description: x.description?.trim().slice(0, 200) || null,
    client_reference: clientRef,
    client_name: clientRef ? x.client_name?.trim() || null : null,
    client_department: clientRef ? normalizeDepartment(x.client_department) : null,
    needs_review: !supplier || ttc === null || !invoiceDate || !coherent,
  };
}

/** Pages valides et sans chevauchement pour chaque facture lue. */
export function normalizePageRanges(
  invoices: Pick<InvoiceExtraction, "start_page" | "end_page">[],
  totalPages: number
): { start: number; end: number }[] {
  return invoices.map((inv, i) => {
    let start = Math.min(Math.max(1, Math.round(inv.start_page || 1)), totalPages);
    let end = Math.min(Math.max(start, Math.round(inv.end_page || start)), totalPages);
    const next = invoices[i + 1];
    if (next && next.start_page > start && end >= next.start_page) end = next.start_page - 1;
    if (end < start) [start, end] = [start, start];
    return { start, end };
  });
}
