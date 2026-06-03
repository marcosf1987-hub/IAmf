import nodemailer from "nodemailer";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_FETCH_TIMEOUT_MS = 25_000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Clave API Brevo (HTTPS). Alias legacy Sendinblue. */
function readBrevoApiKey(): string | undefined {
  const key =
    process.env.BREVO_API_KEY?.trim() ||
    process.env.SENDINBLUE_API_KEY?.trim();
  return key || undefined;
}

function hasBrevoApiKey(): boolean {
  return Boolean(readBrevoApiKey());
}

function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

function resolveMailFromForApi(): string | null {
  return process.env.MAIL_FROM?.trim() || null;
}

function resolveMailFromForSmtp(): string | null {
  const from = process.env.MAIL_FROM?.trim();
  if (from) return from;
  if (isSmtpConfigured()) return process.env.SMTP_USER!.trim();
  return null;
}

function resolveMailFromName(): string {
  return process.env.MAIL_FROM_NAME?.trim() || "PromptPlay";
}

/** True si hay API Brevo (HTTPS, recomendado en Railway Hobby) o SMTP completo. */
export function isMailConfigured(): boolean {
  if (hasBrevoApiKey()) {
    return Boolean(resolveMailFromForApi());
  }
  return isSmtpConfigured() && Boolean(resolveMailFromForSmtp());
}

export type MailStatus = {
  configured: boolean;
  provider: "brevo-api" | "smtp" | "none";
  brevoApiKeySet: boolean;
  mailFromSet: boolean;
  smtpConfigured: boolean;
  hint?: string;
};

/** Diagnóstico sin secretos (GET /health/mail). */
export function getMailStatus(): MailStatus {
  const brevoApiKeySet = hasBrevoApiKey();
  const mailFromSet = Boolean(resolveMailFromForApi());
  const smtpConfigured = isSmtpConfigured();

  if (brevoApiKeySet) {
    if (!mailFromSet) {
      return {
        configured: false,
        provider: "brevo-api",
        brevoApiKeySet: true,
        mailFromSet: false,
        smtpConfigured,
        hint: "Definí MAIL_FROM (remitente verificado en Brevo). No uses solo SMTP en Railway Hobby.",
      };
    }
    return {
      configured: true,
      provider: "brevo-api",
      brevoApiKeySet: true,
      mailFromSet: true,
      smtpConfigured,
      hint: smtpConfigured
        ? "Se usará API Brevo (HTTPS), no SMTP. Podés quitar SMTP_* en Railway Hobby."
        : undefined,
    };
  }

  if (smtpConfigured) {
    return {
      configured: true,
      provider: "smtp",
      brevoApiKeySet: false,
      mailFromSet: Boolean(resolveMailFromForSmtp()),
      smtpConfigured: true,
      hint: "SMTP suele fallar con connection timeout en Railway Hobby. Usá BREVO_API_KEY + MAIL_FROM.",
    };
  }

  return {
    configured: false,
    provider: "none",
    brevoApiKeySet: false,
    mailFromSet: false,
    smtpConfigured: false,
    hint: "Configurá BREVO_API_KEY y MAIL_FROM en el servicio backend.",
  };
}

export function logMailConfigAtStartup(): void {
  const s = getMailStatus();
  // eslint-disable-next-line no-console
  console.info("[mail] startup", JSON.stringify(s));
}

type SendPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

async function sendViaBrevoApi(payload: SendPayload): Promise<{ ok: boolean; error?: string }> {
  const apiKey = readBrevoApiKey();
  const fromEmail = resolveMailFromForApi();
  if (!apiKey) {
    return { ok: false, error: "mail_not_configured" };
  }
  if (!fromEmail) {
    return {
      ok: false,
      error: "Falta MAIL_FROM en el servidor (remitente verificado en Brevo).",
    };
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
      signal: AbortSignal.timeout(BREVO_FETCH_TIMEOUT_MS),
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
  const from = resolveMailFromForSmtp();
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
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
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
    const hint =
      /timeout/i.test(msg) && hasBrevoApiKey()
        ? `${msg} (¿SMTP_* aún activo sin MAIL_FROM? Quitá SMTP o definí MAIL_FROM para usar API.)`
        : /timeout/i.test(msg)
          ? `${msg} (Railway Hobby bloquea SMTP; usá BREVO_API_KEY + MAIL_FROM.)`
          : msg;
    return { ok: false, error: hint };
  }
}

async function dispatchMail(payload: SendPayload): Promise<{ ok: boolean; error?: string }> {
  if (hasBrevoApiKey()) {
    // Nunca SMTP si hay clave API (evita timeout en Railway Hobby con SMTP_* residuales).
    return sendViaBrevoApi(payload);
  }
  if (isSmtpConfigured()) {
    return sendViaSmtp(payload);
  }
  return { ok: false, error: "mail_not_configured" };
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
