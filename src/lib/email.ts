import "server-only";

// Provider abstraction. Add SMTP by installing nodemailer and filling smtp().
export type Email = { to: string; subject: string; text: string; html?: string };

async function consoleProvider(m: Email) {
  if (process.env.NODE_ENV !== "test") console.info(`[email] → ${m.to}: ${m.subject}`);
}
async function resend(m: Email) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html }),
  });
  if (!r.ok) throw new Error(`Resend failed: ${r.status}`);
}
async function sendgrid(m: Email) {
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: m.to }] }],
      from: { email: (process.env.EMAIL_FROM ?? "").replace(/.*<|>.*/g, "") },
      subject: m.subject,
      content: [{ type: "text/plain", value: m.text }, ...(m.html ? [{ type: "text/html", value: m.html }] : [])],
    }),
  });
  if (!r.ok) throw new Error(`SendGrid failed: ${r.status}`);
}
async function smtp(_m: Email) {
  throw new Error("SMTP provider not configured: npm i nodemailer and implement src/lib/email.ts#smtp");
}

const providers = { console: consoleProvider, resend, sendgrid, smtp } as const;

export async function sendEmail(m: Email) {
  const name = (process.env.EMAIL_PROVIDER ?? "console") as keyof typeof providers;
  return (providers[name] ?? consoleProvider)(m);
}
