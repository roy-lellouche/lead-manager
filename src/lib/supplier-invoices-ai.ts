import { generateText, Output } from "ai";
import { z } from "zod";
import { normalizeDepartment, parseAmount, parseIsoDate, round2 } from "@/lib/supplier-invoices";
import type { ParsedInvoice } from "@/lib/invoice-text-parser";

/**
 * Lecture de factures par IA (Vercel AI Gateway) : utilisée seulement quand le
 * PDF n'a pas de texte exploitable (scan, photo) ou un format non reconnu.
 */

const MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";

/** Au-delà, le PDF est trop long pour une seule lecture : on demande de le découper. */
export const MAX_PDF_PAGES = 150;

const lineSchema = z.object({
  reference: z.string().nullable().describe("Référence article, sinon null"),
  description: z.string().describe("Désignation"),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable().describe("Prix unitaire HT"),
  amount: z.number().nullable().describe("Montant HT de la ligne"),
  is_comment: z.boolean().describe("true pour une ligne de commentaire sans montant (ex. « CLIENT DUPONT 60 »)"),
});

const invoiceSchema = z.object({
  start_page: z.number().int().describe("Première page de cette facture dans le document (1 = première page)"),
  end_page: z.number().int().describe("Dernière page de cette facture"),
  is_credit_note: z.boolean().describe("true s'il s'agit d'un avoir"),
  supplier_name: z.string().nullable().describe("Raison sociale de l'ÉMETTEUR (le fournisseur), jamais RS Ecologie"),
  supplier_siret: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable().describe("YYYY-MM-DD"),
  due_date: z.string().nullable().describe("Échéance YYYY-MM-DD ; calcule-la si seule une condition est indiquée"),
  delivery_date: z.string().nullable().describe("YYYY-MM-DD"),
  order_reference: z.string().nullable().describe("Référence de commande / bon de livraison / source"),
  payment_terms: z.string().nullable().describe("Conditions de paiement telles qu'écrites"),
  amount_ht: z.number().nullable(),
  amount_tva: z.number().nullable(),
  amount_ttc: z.number().nullable().describe("Total TTC / net à payer (négatif pour un avoir)"),
  client_reference: z
    .string()
    .nullable()
    .describe("Texte EXACT désignant le client final de RS Ecologie (ligne de commentaire du type « CLIENT BAROUDI 60 »), sinon null"),
  client_name: z.string().nullable().describe("Nom du client final, sans « CLIENT » ni département"),
  client_department: z.string().nullable().describe("Département du client s'il est écrit (« 60 », « 08 »)"),
  description: z.string().nullable().describe("Résumé très court du matériel facturé"),
  lines: z.array(lineSchema).describe("Toutes les lignes de la facture, dans l'ordre"),
});

const documentSchema = z.object({ invoices: z.array(invoiceSchema) });

const PROMPT = `Tu lis un document de facturation fournisseur reçu par RS Ecologie, entreprise française de rénovation énergétique.
Le document peut contenir UNE ou PLUSIEURS factures à la suite : repère chaque facture (numéro distinct), ses pages et toutes ses lignes.
Règles : le fournisseur est l'émetteur (jamais RS Ecologie) ; dates YYYY-MM-DD ; montants en nombres ; n'invente rien (null si absent).
La référence client est une ligne de commentaire désignant le client final (ex. « CLIENT BAROUDI 60 ») ; une remarque technique n'en est pas une.`;

/** Texte de chaque page d'un PDF (vide pour un scan sans couche texte). */
export async function pdfPageTexts(data: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

export async function extractInvoicesWithAI(
  data: Uint8Array,
  mediaType: string,
  pageTexts: string[] | null
): Promise<ParsedInvoice[]> {
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
    maxOutputTokens: 64000,
    messages: [{ role: "user", content }],
  });
  return output.invoices.map((inv) => ({
    ...inv,
    lines: inv.lines.map((l, i) => ({ ...l, position: i + 1, description: l.description.trim() })),
  }));
}

export interface ExtractedInvoiceFields {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  delivery_date: string | null;
  order_reference: string | null;
  payment_terms: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  description: string | null;
  client_reference: string | null;
  client_name: string | null;
  client_department: string | null;
  needs_review: boolean;
}

/** Nettoie une facture lue (texte ou IA) et indique si une vérification humaine s'impose. */
export function toInvoiceFields(x: ParsedInvoice): ExtractedInvoiceFields {
  const ht = parseAmount(x.amount_ht);
  const tva = parseAmount(x.amount_tva);
  let ttc = parseAmount(x.amount_ttc);
  if (ttc === null && ht !== null) ttc = round2(ht + (tva ?? 0));
  const supplier = x.supplier_name?.trim() || null;
  const invoiceDate = parseIsoDate(x.invoice_date);
  // Échéance absente : à réception, soit la date de facture.
  const dueDate = parseIsoDate(x.due_date) ?? invoiceDate;
  const coherent = ht === null || ttc === null || Math.abs(ht + (tva ?? 0) - ttc) <= 1;
  const clientRef = x.client_reference?.trim() || null;
  return {
    supplier_name: supplier,
    invoice_number: x.invoice_number?.trim() || null,
    invoice_date: invoiceDate,
    due_date: dueDate,
    delivery_date: parseIsoDate(x.delivery_date),
    order_reference: x.order_reference?.trim() || null,
    payment_terms: x.payment_terms?.trim() || null,
    amount_ht: ht,
    amount_tva: tva,
    amount_ttc: ttc,
    description: x.description?.trim().slice(0, 200) || null,
    client_reference: clientRef,
    client_name: clientRef ? x.client_name?.trim() || null : null,
    client_department: clientRef ? normalizeDepartment(x.client_department) : null,
    needs_review: !supplier || ttc === null || !invoiceDate || !coherent,
  };
}

/** Pages valides et sans chevauchement pour chaque facture lue. */
export function normalizePageRanges(
  invoices: Pick<ParsedInvoice, "start_page" | "end_page">[],
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
