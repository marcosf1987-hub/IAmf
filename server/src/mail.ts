import nodemailer from "nodemailer";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isBrevoApiConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY?.trim() && resolveMailFrom());
}

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

/** True si hay API Brevo (HTTPS, recomendado en Railway Hobby) o SMTP completo. */
export function isMailConfigured(): boolean {
  return isBrevoApiConfigured() || isSmtpConfigured();
}

function resolveMailFrom(): string | null {
  const from = process.env.MAIL_FROM?.trim();
  if (from) return from;
  if (isSmtpConfigured()) return process.env.SMTP_USER!.trim();
  return null;
}

function resolveMailFromName(): string {
  return process.env.MAIL_FROM_NAME?.trim() || "PromptPlay";
}

function useBrevoApi(): boolean {
  return isBrevoApiConfigured();
}

type SendPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendViaBrevoApi(payload: SendPayload): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY!.trim();
  const fromEmail = resolveMailFrom();
  if (!fromEmail) {
    return { ok: false, error: "mail_not_configured" };
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: resolveMailFromName(), email: fromEmail },
        to: [{ email: payload.to }],
        subject: payload.subject,
        htmlContent: payload.html,
        textContent: payload.text,
      }),
    });

    if (res.ok) {
      return { ok: true };
    }

    const bodyText = await res.text();
    let detail = bodyText.slice(0, 500);
    try {
      const j = JSON.parse(bodyText) as { message?: string };
      if (j.message) detail = j.message;
    } catch {
      /* usar bodyText */
    }
    const msg = `Brevo API ${res.status}: ${detail}`;
    // eslint-disable-next-line no-console
    console.error("[mail] sendViaBrevoApi failed:", msg);
    return { ok: false, error: msg };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[mail] sendViaBrevoApi failed:", msg);
    return { ok: false, error: msg };
  }
}

async function sendViaSmtp(payload: SendPayload): Promise<{ ok: boolean; error?: string }> {
  const from = resolveMailFrom();
  if (!from || !isSmtpConfigured()) {
    return { ok: false, error: "mail_not_configured" };
  }

  const host = process.env.SMTP_HOST!.trim();
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
  });

  try {
    await transporter.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[mail] sendViaSmtp failed:", msg);
    return { ok: false, error: msg };
  }
}

async function dispatchMail(payload: SendPayload): Promise<{ ok: boolean; error?: string }> {
  if (!isMailConfigured()) {
    return { ok: false, error: "mail_not_configured" };
  }
  if (useBrevoApi()) {
    return sendViaBrevoApi(payload);
  }
  return sendViaSmtp(payload);
}

export async function sendInvitationEmail(opts: {
  to: string;
  companyName: string;
  inviteUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const subject = `Invitación a ${opts.companyName} — PromptPlay`;
  const text = [
    "Hola,",
    "",
    `Te invitaron a unirte a ${opts.companyName} en PromptPlay.`,
    "",
    `Aceptá la invitación (vence en 7 días):`,
    opts.inviteUrl,
    "",
    "Si no esperabas este correo, puedes ignorarlo.",
  ].join("\n");
  const html = `<p>Hola,</p>
<p>Te invitaron a unirte a <strong>${escapeHtml(opts.companyName)}</strong> en PromptPlay.</p>
<p><a href="${opts.inviteUrl.replace(/"/g, "&quot;")}">Aceptar invitación</a> (vence en 7 días)</p>
<p>Si no esperabas este correo, puedes ignorarlo.</p>`;

  return dispatchMail({ to: opts.to, subject, text, html });
}

export async function sendCompetitionInvitationEmail(opts: {
  to: string;
  competitionName: string;
  inviteUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  const subject = `Invitación a la liga «${opts.competitionName}» — PromptPlay`;
  const text = [
    "Hola,",
    "",
    `Te invitaron a unirte a la liga «${opts.competitionName}» en PromptPlay.`,
    "",
    `Aceptá la invitación (vence en 7 días):`,
    opts.inviteUrl,
    "",
    "Si no esperabas este correo, podés ignorarlo.",
  ].join("\n");
  const html = `<p>Hola,</p>
<p>Te invitaron a unirte a la liga <strong>${escapeHtml(opts.competitionName)}</strong> en PromptPlay.</p>
<p><a href="${opts.inviteUrl.replace(/"/g, "&quot;")}">Aceptar invitación</a> (vence en 7 días)</p>
<p>Si no esperabas este correo, podés ignorarlo.</p>`;

  return dispatchMail({ to: opts.to, subject, text, html });
}
