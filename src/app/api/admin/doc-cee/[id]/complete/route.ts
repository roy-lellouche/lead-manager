import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserFromClient } from "@/lib/supabase/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CEE_DOC_NOTIFY_EMAIL_DEFAULT,
  CEE_DOCS_BUCKET,
  CEE_MANDATAIRE_LABELS,
  type CeeDocRequest,
} from "@/lib/doc-cee";
import { canAccessRequest, requireCeeDocStaff, withCeeDocUrls } from "@/lib/doc-cee-server";
import { sendMail } from "@/lib/mailer";
import { formatDateTimeParis } from "@/lib/date";

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * POST { complete: true }  : marque le dossier complet (secrétariat, admin ou télépro assigné)
 *                            et prévient par email.
 * POST { complete: false } : rouvre le dossier (admin, secrétariat, responsable CEE).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const admin = createAdminClient();
  const auth = await requireCeeDocStaff(async () => getUserFromClient(supabase), admin);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { complete?: unknown } | null;
  const complete = body?.complete !== false;

  const { data: existing } = await admin.from("cee_doc_requests").select("*").eq("id", id).single();
  if (!existing || !canAccessRequest(auth, existing))
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });

  if (complete && auth.role === "cee")
    return NextResponse.json(
      { error: "Seuls le secrétariat et le télépro marquent un dossier complet." },
      { status: 403 }
    );
  if (!complete && auth.role === "telepro") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const now = new Date().toISOString();
  const wasComplete = !!existing.completed_at;
  const { data, error } = await admin
    .from("cee_doc_requests")
    .update(
      complete
        ? {
            completed_at: existing.completed_at ?? now,
            completed_by: existing.completed_by ?? auth.userId,
            updated_at: now,
          }
        : { completed_at: null, completed_by: null, updated_at: now }
    )
    .eq("id", id)
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });

  const [row] = await withCeeDocUrls(admin, [data as CeeDocRequest]);

  // Email uniquement au passage à « complet » (pas de doublon si déjà complet).
  let mail: { sent: boolean; error?: string } | null = null;
  if (complete && !wasComplete) {
    const paths = row.files.map((f) => f.path);
    const longUrls = new Map<string, string>();
    if (paths.length) {
      const { data: signed } = await admin.storage.from(CEE_DOCS_BUCKET).createSignedUrls(paths, 7 * 24 * 3600);
      for (const s of signed ?? []) if (s.path && s.signedUrl) longUrls.set(s.path, s.signedUrl);
    }
    const mandataire = CEE_MANDATAIRE_LABELS[row.mandataire] ?? row.mandataire;
    const appUrl = `${req.nextUrl.origin}/admin/doc-cee`;
    const lines: [string, string | null][] = [
      ["Mandataire", mandataire],
      ["Client / dossier", row.client_name],
      ["Document demandé", row.document],
      ["Marqué complet par", row.completed_by_name],
      ["Le", formatDateTimeParis(row.completed_at)],
      ["Télépro assigné", row.assigned_to_name],
      ["Commentaire responsable CEE", row.request_comment],
      ["Commentaire secrétariat", row.response_comment],
      ["Commentaire télépro", row.telepro_comment],
    ];
    const filled = lines.filter((l): l is [string, string] => !!l[1]);
    const files = row.files.map((f) => ({ name: f.name, url: longUrls.get(f.path) ?? "" }));

    const text = [
      `Le dossier CEE ${row.client_name} (${mandataire}) est complet.`,
      "",
      ...filled.map(([k, v]) => `${k} : ${v}`),
      "",
      files.length ? "Documents (liens valables 7 jours) :" : "Aucun document déposé dans le CRM.",
      ...files.map((f) => `- ${f.name} : ${f.url}`),
      "",
      `Voir dans le CRM : ${appUrl}`,
    ].join("\n");
    const html = `
      <p>Le dossier CEE <strong>${escapeHtml(row.client_name)}</strong> (${escapeHtml(mandataire)}) est <strong style="color:#16a34a">complet</strong>.</p>
      <table cellpadding="4" style="border-collapse:collapse">${filled
        .map(([k, v]) => `<tr><td style="color:#666">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
        .join("")}</table>
      ${
        files.length
          ? `<p>Documents (liens valables 7 jours) :</p><ul>${files
              .map((f) => `<li><a href="${escapeHtml(f.url)}">${escapeHtml(f.name)}</a></li>`)
              .join("")}</ul>`
          : "<p>Aucun document déposé dans le CRM.</p>"
      }
      <p><a href="${escapeHtml(appUrl)}">Voir dans le CRM</a></p>`;

    mail = await sendMail({
      to: process.env.CEE_DOC_NOTIFY_EMAIL || CEE_DOC_NOTIFY_EMAIL_DEFAULT,
      subject: `Dossier CEE complet – ${row.client_name} (${mandataire})`,
      text,
      html,
    });
    if (!mail.sent) console.error("[doc-cee] email dossier complet non envoyé :", mail.error);
  }

  return NextResponse.json({ ...row, mail });
}
