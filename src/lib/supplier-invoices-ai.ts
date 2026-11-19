import { generateText, Output } from "ai";
import { z } from "zod";
import { parseAmount, parseIsoDate, round2 } from "@/lib/supplier-invoices";

/**
 * Lecture automatique d'une facture fournisseur (PDF ou photo) par IA,
 * via Vercel AI Gateway (authentification OIDC automatique sur Vercel,
 * ou AI_GATEWAY_API_KEY en local).
 */

const MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";

const invoiceSchema = z.object({
  is_invoice: z.boolean().describe("true si le document est bien une facture (ou un avoir) fournisseur"),
  supplier_name: z.string().nullable().describe("Raison sociale de l'ÉMETTEUR de la facture (le fournisseur), pas du client"),
  supplier_siret: z.string().nullable().describe("SIRET ou SIREN de l'émetteur, chiffres seulement"),
  invoice_number: z.string().nullable().describe("Numéro de la facture"),
  invoice_date: z.string().nullable().describe("Date de facture au format YYYY-MM-DD"),
  due_date: z
    .string()
    .nullable()
    .describe("Date d'échéance de paiement au format YYYY-MM-DD. Si seule une condition est indiquée (ex. 30 jours fin de mois), calcule la date."),
  amount_ht: z.number().nullable().describe("Total hors taxes en euros"),
  amount_tva: z.number().nullable().describe("Montant total de TVA en euros"),
  amount_ttc: z.number().nullable().describe("Total TTC / net à payer en euros (négatif pour un avoir)"),
  amount_already_paid: z
    .number()
    .nullable()
    .describe("Acompte ou montant déjà réglé mentionné sur la facture, sinon null"),
  description: z.string().nullable().describe("Résumé très court (max 80 caractères) de ce qui est facturé"),
});

export type InvoiceExtraction = z.infer<typeof invoiceSchema>;

export interface ExtractedInvoiceFields {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_ht: number | null;
  amount_tva: number | null;
  amount_ttc: number | null;
  amount_paid: number;
  description: string | null;
  needs_review: boolean;
}

const PROMPT = `Tu lis une facture fournisseur reçue par une entreprise française de rénovation énergétique (RS Ecologie).
Extrais les informations demandées. Règles :
- Le fournisseur est l'entreprise qui ÉMET la facture (en-tête, logo, mentions légales), jamais RS Ecologie.
- Les dates au format YYYY-MM-DD. Les montants en nombres (point décimal), sans symbole.
- Si une information est absente ou illisible, mets null ; n'invente rien.
- Si le TTC manque mais que HT et TVA sont présents, calcule-le.`;

export async function extractInvoice(data: Uint8Array, mediaType: string): Promise<InvoiceExtraction> {
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: invoiceSchema }),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "file", mediaType, data },
        ],
      },
    ],
  });
  return output;
}

/** Nettoie la lecture IA et indique si une vérification humaine s'impose. */
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
  return {
    supplier_name: supplier,
    invoice_number: x.invoice_number?.trim() || null,
    invoice_date: invoiceDate,
    due_date: dueDate,
    amount_ht: ht,
    amount_tva: tva,
    amount_ttc: ttc,
    amount_paid: ttc !== null ? Math.min(paid, Math.max(ttc, 0)) : 0,
    description: x.description?.trim().slice(0, 200) || null,
    needs_review: !x.is_invoice || !supplier || ttc === null || !invoiceDate || !coherent,
  };
}
