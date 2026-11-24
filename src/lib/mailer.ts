import nodemailer from "nodemailer";

/**
 * Envoi d'emails par SMTP. Variables d'environnement :
 * - SMTP_USER / SMTP_PASS (obligatoires ; pour Gmail : adresse + mot de passe d'application)
 * - SMTP_HOST (défaut smtp.gmail.com), SMTP_PORT (défaut 465), SMTP_FROM (défaut SMTP_USER)
 * Sans configuration, l'envoi est ignoré et signalé (jamais d'exception).
 */
export function isMailerConfigured(): boolean {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ sent: boolean; error?: string }> {
  if (!isMailerConfigured()) return { sent: false, error: "SMTP non configuré (SMTP_USER / SMTP_PASS)" };
  const port = Number(process.env.SMTP_PORT || 465);
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
