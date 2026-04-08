import nodemailer from "nodemailer";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** True si hay credenciales SMTP para enviar mail (p. ej. Gmail app password, SendGrid SMTP). */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export async function sendInvitationEmail(opts: {
  to: string;
  companyName: string;
  inviteUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isMailConfigured()) {
    return { ok: false, error: "mail_not_configured" };
  }

  const from = process.env.MAIL_FROM?.trim() || process.env.SMTP_USER!.trim();
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

  const subject = `Invitación a ${opts.companyName} — PromptPlay`;

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject,
      text: [
        "Hola,",
        "",
        `Te invitaron a unirte a ${opts.companyName} en PromptPlay.`,
        "",
        `Aceptá la invitación (vence en 7 días):`,
        opts.inviteUrl,
        "",
        "Si no esperabas este correo, puedes ignorarlo.",
      ].join("\n"),
      html: `<p>Hola,</p>
<p>Te invitaron a unirte a <strong>${escapeHtml(opts.companyName)}</strong> en PromptPlay.</p>
<p><a href="${opts.inviteUrl.replace(/"/g, "&quot;")}">Aceptar invitación</a> (vence en 7 días)</p>
<p>Si no esperabas este correo, puedes ignorarlo.</p>`,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error("[mail] sendInvitationEmail failed:", msg);
    return { ok: false, error: msg };
  }
}
