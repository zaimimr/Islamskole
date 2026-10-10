import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { formatNok } from "@/lib/money";

const FROM =
  process.env.RESEND_FROM || "Islamskole Bærum <onboarding@resend.dev>";

export type EmailLang = "no" | "en";

const STRINGS = {
  no: {
    footer: "Sendt automatisk fra islamskole.no",
    fallback: "Virker ikke knappen? Kopier denne lenken inn i nettleseren:",
    rows: {
      student: "Elev",
      class: "Klasse",
      schoolYear: "Skoleår",
      amount: "Beløp",
      amountPaid: "Beløp betalt",
      amountCovered: "Beløp dekket",
      amountRefunded: "Beløp tilbakebetalt",
      dueDate: "Betalingsfrist",
      paidOn: "Dato",
      method: "Betalingsmåte",
      reference: "Referanse",
      remaining: "Gjenstår for skoleåret",
      nextDue: "Neste frist",
      startsOn: "Første skoledag",
      address: "Oppmøtested",
      hours: "Tid",
    },
    methods: {
      vipps: "Vipps",
      kontant: "Kontant",
      bank: "Bankoverføring",
      sadaqa: "Sadaqa",
      annet: "Annet",
    } as Record<string, string>,
    paymentLink: {
      subject: (child: string) => `Betaling for ${child}`,
      badge: "Betaling",
      title: "Betaling av skolepenger",
      intro: (child: string) =>
        `Hei, her er betalingslenken for ${child}. Trykk på knappen for å betale med Vipps.`,
      cta: "Betal med Vipps",
      totalLabel: "Totalt å betale",
    },
    installment: {
      subject: (dueDate: string) => `Betalingsfrist ${dueDate} - skoleavgift`,
      badge: "Avdrag",
      title: "Avdrag på skoleavgiften",
      intro: (children: string) =>
        `Hei, her er betalingslenken for neste avdrag på skoleavgiften for ${children}. Trykk på knappen for å betale med Vipps.`,
      cta: "Betal med Vipps",
      totalLabel: "Totalt å betale",
    },
    receipt: {
      subject: (child: string) => `Kvittering - betaling for ${child}`,
      badge: "Kvittering",
      title: "Betaling mottatt",
      intro: (child: string) =>
        `Hei, vi har mottatt betalingen for ${child}. Takk!`,
      coveredSubject: (child: string) => `Skolepengene for ${child} er dekket`,
      coveredTitle: "Skolepenger dekket",
      coveredIntro: (child: string) =>
        `Hei, skolen har dekket skolepenger for ${child}. Dere trenger ikke gjøre noe for dette beløpet.`,
      enrollmentNote: (dates: string[]) =>
        dates.length > 0
          ? `Dette er første del av skoleavgiften. Resten betales innen ${dates.join(" og ")}, eller etter avtale med skolen. Dere får betalingslenke på e-post.`
          : "Dette er første del av skoleavgiften. Skolen avtaler resten med dere og sender betalingslenke på e-post.",
    },
    refund: {
      subject: (child: string) => `Tilbakebetaling - ${child}`,
      badge: "Tilbakebetaling",
      title: "Penger tilbakebetalt",
      intro: (child: string) =>
        `Hei, skolen har betalt tilbake et beløp for ${child}.`,
      vippsNote: "Beløpet kommer tilbake på kontoen som ble brukt i Vipps, vanligvis innen noen virkedager.",
    },
    welcome: {
      subject: (child: string) => `Velkommen til Islamskole Bærum, ${child}`,
      badge: "Velkommen",
      title: "Plassen er klar",
      intro: (child: string, className: string | null) =>
        className
          ? `Hei, ${child} har fått plass i ${className}. Vi gleder oss til å se dere!`
          : `Hei, ${child} har fått plass hos oss. Vi gleder oss til å se dere!`,
    },
    loginLink: {
      subject: "Logg inn på Min side",
      badge: "Innlogging",
      title: "Logg inn på Min side",
      intro: "Hei! Trykk på knappen under for å logge inn hos Islamskole Bærum.",
      note: "Lenken virker én gang og går ut etter en time. Har du ikke bedt om den, kan du trygt se bort fra denne e-posten.",
      cta: "Logg inn",
    },
    emailChange: {
      subject: "Bekreft ny e-postadresse",
      badge: "Min side",
      title: "Bekreft ny e-postadresse",
      intro: (name: string) =>
        `Hei ${name}! Noen har bedt om å bruke denne adressen for innlogging og beskjeder fra Islamskole Bærum. Trykk på knappen for å bekrefte.`,
      note: "Lenken går ut etter 24 timer. Har du ikke bedt om dette, kan du trygt se bort fra denne e-posten.",
      cta: "Bekreft e-post",
    },
    teacherConfirmation: {
      subject: "Vi har mottatt søknaden din",
      badge: "Lærer",
      title: "Takk for søknaden",
      intro: (name: string) =>
        `Hei ${name}, takk for interessen. Vi tar kontakt så snart vi har gått gjennom søknaden din.`,
    },
  },
  en: {
    footer: "Sent automatically from islamskole.no",
    fallback: "Button not working? Copy this link into your browser:",
    rows: {
      student: "Student",
      class: "Class",
      schoolYear: "School year",
      amount: "Amount",
      amountPaid: "Amount paid",
      amountCovered: "Amount covered",
      amountRefunded: "Amount refunded",
      dueDate: "Payment deadline",
      paidOn: "Date",
      method: "Payment method",
      reference: "Reference",
      remaining: "Remaining this school year",
      nextDue: "Next deadline",
      startsOn: "First school day",
      address: "Location",
      hours: "Time",
    },
    methods: {
      vipps: "Vipps",
      kontant: "Cash",
      bank: "Bank transfer",
      sadaqa: "Sadaqa",
      annet: "Other",
    } as Record<string, string>,
    paymentLink: {
      subject: (child: string) => `Payment for ${child}`,
      badge: "Payment",
      title: "School fee payment",
      intro: (child: string) =>
        `Hi, here is the payment link for ${child}. Tap the button to pay with Vipps.`,
      cta: "Pay with Vipps",
      totalLabel: "Total to pay",
    },
    installment: {
      subject: (dueDate: string) => `Payment due ${dueDate} - school fee`,
      badge: "Installment",
      title: "School fee installment",
      intro: (children: string) =>
        `Hi, here is the payment link for the next school fee installment for ${children}. Tap the button to pay with Vipps.`,
      cta: "Pay with Vipps",
      totalLabel: "Total to pay",
    },
    receipt: {
      subject: (child: string) => `Receipt - payment for ${child}`,
      badge: "Receipt",
      title: "Payment received",
      intro: (child: string) =>
        `Hi, we have received the payment for ${child}. Thank you!`,
      coveredSubject: (child: string) => `The school fee for ${child} is covered`,
      coveredTitle: "School fee covered",
      coveredIntro: (child: string) =>
        `Hi, the school has covered school fees for ${child}. You do not need to do anything for this amount.`,
      enrollmentNote: (dates: string[]) =>
        dates.length > 0
          ? `This is the first part of the school fee. The remainder is due by ${dates.join(" and ")}, or as agreed with the school. Payment links are sent by email.`
          : "This is the first part of the school fee. The school will agree the remainder with you and send a payment link by email.",
    },
    refund: {
      subject: (child: string) => `Refund - ${child}`,
      badge: "Refund",
      title: "Money refunded",
      intro: (child: string) =>
        `Hi, the school has refunded an amount for ${child}.`,
      vippsNote: "The amount is returned to the account used in Vipps, usually within a few business days.",
    },
    welcome: {
      subject: (child: string) => `Welcome to Islamskole Bærum, ${child}`,
      badge: "Welcome",
      title: "The place is ready",
      intro: (child: string, className: string | null) =>
        className
          ? `Hi, ${child} has been placed in ${className}. We look forward to seeing you!`
          : `Hi, ${child} has a place with us. We look forward to seeing you!`,
    },
    loginLink: {
      subject: "Sign in to My page",
      badge: "Sign in",
      title: "Sign in to My page",
      intro: "Hi! Tap the button below to sign in to Islamskole Bærum.",
      note: "The link works once and expires after one hour. If you did not ask for it, you can safely ignore this email.",
      cta: "Sign in",
    },
    emailChange: {
      subject: "Confirm your new email address",
      badge: "My page",
      title: "Confirm your new email address",
      intro: (name: string) =>
        `Hi ${name}! Someone asked to use this address for signing in and messages from Islamskole Bærum. Tap the button to confirm.`,
      note: "The link expires after 24 hours. If you did not ask for this, you can safely ignore this email.",
      cta: "Confirm email",
    },
    teacherConfirmation: {
      subject: "We have received your application",
      badge: "Teacher",
      title: "Thank you for applying",
      intro: (name: string) =>
        `Hi ${name}, thank you for your interest. We will be in touch once we have reviewed your application.`,
    },
  },
} as const;

function strings(lang: EmailLang) {
  return STRINGS[lang] ?? STRINGS.no;
}

function getClient() {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Row = [label: string, value: string | null | undefined];

type Cta = { label: string; url: string; tone?: "vipps" };

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.islamskole.no").replace(/\/$/, "");

const HEADING_FONT = "'Fredoka','Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BODY_FONT = "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function renderEmail(opts: {
  lang: EmailLang;
  badge: string;
  title: string;
  intro: string;
  rows: Row[];
  note?: string;
  cta?: Cta;
}) {
  const t = strings(opts.lang);
  const ctaColor = opts.cta?.tone === "vipps" ? "#ff5b24" : "#317b33";
  const cta = opts.cta
    ? `<tr><td style="padding:8px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${ctaColor};">
            <a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;padding:14px 32px;font-family:${BODY_FONT};font-size:16px;font-weight:800;line-height:20px;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(opts.cta.label)}</a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:20px 0 0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:#5f6d61;">
          ${escapeHtml(t.fallback)}<br>
          <a href="${escapeHtml(opts.cta.url)}" style="color:#317b33;word-break:break-all;">${escapeHtml(opts.cta.url)}</a>
        </td></tr>`
    : "";
  const visibleRows = opts.rows.filter(
    ([, value]) => value != null && String(value).trim() !== "",
  );
  const rows = visibleRows.length
    ? `<tr><td style="padding:0 0 ${opts.cta || opts.note ? 24 : 0}px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border:1px solid #dae1d3;border-radius:14px;">
            ${visibleRows
              .map(
                ([label, value], index) => `
            <tr>
              <td style="padding:12px 16px;${index ? "border-top:1px solid #dae1d3;" : ""}font-family:${BODY_FONT};font-size:13px;font-weight:700;color:#5f6d61;width:40%;vertical-align:top;">${escapeHtml(label)}</td>
              <td style="padding:12px 16px;${index ? "border-top:1px solid #dae1d3;" : ""}font-family:${BODY_FONT};font-size:15px;color:#19221a;vertical-align:top;white-space:pre-line;">${escapeHtml(String(value))}</td>
            </tr>`,
              )
              .join("")}
          </table>
        </td></tr>`
    : "";
  const note = opts.note
    ? `<tr><td style="padding:24px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding:14px 16px;background:#eff4eb;border-radius:12px;font-family:${BODY_FONT};font-size:14px;line-height:21px;color:#3d4a3f;">${escapeHtml(opts.note)}</td>
          </tr></table>
        </td></tr>`
    : "";

  return `<!doctype html>
<html lang="${opts.lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Nunito:wght@400;700;800&display=swap" rel="stylesheet">
    <title>${escapeHtml(opts.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#fdfaf0;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(opts.intro)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fdfaf0;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr><td align="center" style="padding:0 0 24px;">
            <a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/brand/logo.png" width="140" height="57" alt="Islamskole Bærum" style="display:block;border:0;width:140px;height:auto;"></a>
          </td></tr>
          <tr><td style="background:#ffffff;border:1px solid #dae1d3;border-radius:20px;overflow:hidden;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="height:6px;line-height:6px;font-size:0;background:#4daa4b;">&nbsp;</td></tr>
              <tr><td style="padding:32px 32px 36px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:0 0 12px;">
                    <span style="display:inline-block;padding:4px 12px;border-radius:999px;background:#f9e6bb;color:#513716;font-family:${BODY_FONT};font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(opts.badge)}</span>
                  </td></tr>
                  <tr><td style="padding:0 0 12px;font-family:${HEADING_FONT};font-size:28px;line-height:34px;font-weight:600;color:#19221a;">${escapeHtml(opts.title)}</td></tr>
                  <tr><td style="padding:0 0 24px;font-family:${BODY_FONT};font-size:16px;line-height:25px;color:#3d4a3f;white-space:pre-line;">${escapeHtml(opts.intro)}</td></tr>
                  ${rows}
                  ${cta}
                  ${note}
                </table>
              </td></tr>
            </table>
          </td></tr>
          <tr><td align="center" style="padding:24px 16px 0;font-family:${BODY_FONT};font-size:12px;line-height:18px;color:#5f6d61;">
            Islamskole Bærum &middot; <a href="${SITE}" style="color:#5f6d61;">islamskole.no</a><br>
            ${escapeHtml(t.footer)}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function renderText(opts: {
  title: string;
  intro: string;
  rows: Row[];
  note?: string;
  cta?: Cta;
}) {
  return [
    opts.title,
    opts.intro,
    ...opts.rows
      .filter(([, value]) => value != null && String(value).trim() !== "")
      .map(([label, value]) => `${label}: ${value}`),
    opts.cta ? `${opts.cta.label}: ${opts.cta.url}` : null,
    opts.note ?? null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function writeOutbox(
  dir: string,
  message: { to: string | string[]; subject: string; html: string; text: string; links: string[] },
) {
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify(message),
    );
    return true;
  } catch (error) {
    console.error("Email outbox write failed", error);
    return false;
  }
}

async function send(opts: {
  lang: EmailLang;
  to: string | string[];
  subject: string;
  replyTo?: string | null;
  badge: string;
  title: string;
  intro: string;
  rows: Row[];
  note?: string;
  cta?: Cta;
  idempotencyKey?: string;
}) {
  const html = renderEmail({
    lang: opts.lang,
    badge: opts.badge,
    title: opts.title,
    intro: opts.intro,
    rows: opts.rows,
    note: opts.note,
    cta: opts.cta,
  });
  const outbox = process.env.EMAIL_OUTBOX_DIR;
  if (outbox) {
    return await writeOutbox(outbox, {
      to: opts.to,
      subject: opts.subject,
      html,
      text: renderText(opts),
      links: opts.cta ? [opts.cta.url] : [],
    });
  }
  const resend = getClient();
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      replyTo: opts.replyTo ?? undefined,
      html,
      text: renderText(opts),
    }, opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined);
    if (error) {
      console.error("Resend email failed", error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Resend email failed", error);
    return false;
  }
}

function formatDueDate(value: string | null | undefined, lang: EmailLang) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(lang === "en" ? "en-GB" : "nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Oslo",
  });
}

export type EmailChild = { name: string; amount: number };

export async function sendSchoolNotification(opts: {
  to: string;
  lang: EmailLang;
  subject: string;
  title: string;
  intro: string;
  rows: Row[];
  note?: string;
  cta?: Cta;
  idempotencyKey: string;
}) {
  return send({ ...opts, badge: "Islamskole Bærum" });
}

function joinNames(children: { name: string }[]) {
  return children.map((child) => child.name).filter(Boolean).join(", ");
}

export async function sendPaymentLinkEmail(opts: {
  to: string | string[];
  children: EmailChild[];
  amount: number;
  schoolYear: string | null;
  className?: string | null;
  dueDate?: string | null;
  remaining?: number | null;
  url: string;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  const names = joinNames(opts.children);
  const several = opts.children.length > 1;
  return await send({
    lang,
    to: opts.to,
    subject: t.paymentLink.subject(names),
    badge: t.paymentLink.badge,
    title: t.paymentLink.title,
    intro: t.paymentLink.intro(names),
    cta: { label: t.paymentLink.cta, url: opts.url, tone: "vipps" },
    rows: [
      ...(several
        ? opts.children.map((child): Row => [child.name, formatNok(child.amount)])
        : [[t.rows.student, names] as Row]),
      [t.rows.class, several ? null : opts.className],
      [t.rows.schoolYear, opts.schoolYear],
      [several ? t.paymentLink.totalLabel : t.rows.amount, formatNok(opts.amount)],
      [t.rows.dueDate, formatDueDate(opts.dueDate, lang)],
      [
        t.rows.remaining,
        opts.remaining != null && opts.remaining > opts.amount
          ? formatNok(opts.remaining)
          : null,
      ],
    ],
  });
}

export async function sendInstallmentEmail(opts: {
  to: string | string[];
  children: { name: string; amount: number }[];
  totalAmount: number;
  schoolYear: string | null;
  dueDate: string;
  remaining?: number | null;
  url: string;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  const dueLabel = formatDueDate(opts.dueDate, lang) ?? opts.dueDate;
  const childNames = opts.children.map((child) => child.name).join(", ");
  return await send({
    lang,
    to: opts.to,
    subject: t.installment.subject(dueLabel),
    badge: t.installment.badge,
    title: t.installment.title,
    intro: t.installment.intro(childNames),
    cta: { label: t.installment.cta, url: opts.url, tone: "vipps" },
    rows: [
      ...opts.children.map(
        (child): Row => [child.name, formatNok(child.amount)],
      ),
      [t.installment.totalLabel, formatNok(opts.totalAmount)],
      [t.rows.schoolYear, opts.schoolYear],
      [t.rows.dueDate, dueLabel],
      [
        t.rows.remaining,
        opts.remaining != null && opts.remaining > opts.totalAmount
          ? formatNok(opts.remaining)
          : null,
      ],
    ],
  });
}

export async function sendPaymentReceiptEmail(opts: {
  to: string | string[];
  childName: string;
  amount: number;
  schoolYear: string | null;
  className?: string | null;
  method?: string | null;
  paidOn?: string | null;
  reference?: string | null;
  remaining?: number | null;
  nextDueDate?: string | null;
  enrollmentDueDates?: string[] | null;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  const covered = opts.method === "sadaqa";
  const intro = covered
    ? t.receipt.coveredIntro(opts.childName)
    : opts.enrollmentDueDates
      ? `${t.receipt.intro(opts.childName)} ${t.receipt.enrollmentNote(
          opts.enrollmentDueDates
            .map((date) => formatDueDate(date, lang))
            .filter((date): date is string => Boolean(date)),
        )}`
      : t.receipt.intro(opts.childName);
  return await send({
    lang,
    to: opts.to,
    subject: covered
      ? t.receipt.coveredSubject(opts.childName)
      : t.receipt.subject(opts.childName),
    badge: t.receipt.badge,
    title: covered ? t.receipt.coveredTitle : t.receipt.title,
    intro,
    rows: [
      [t.rows.student, opts.childName],
      [t.rows.class, opts.className],
      [t.rows.schoolYear, opts.schoolYear],
      [covered ? t.rows.amountCovered : t.rows.amountPaid, formatNok(opts.amount)],
      [t.rows.paidOn, formatDueDate(opts.paidOn, lang)],
      [t.rows.method, opts.method ? (t.methods[opts.method] ?? null) : null],
      [t.rows.reference, opts.reference],
      [t.rows.remaining, opts.remaining != null ? formatNok(opts.remaining) : null],
      [
        t.rows.nextDue,
        opts.remaining ? formatDueDate(opts.nextDueDate, lang) : null,
      ],
    ],
  });
}

export async function sendRefundEmail(opts: {
  to: string | string[];
  childName: string;
  amount: number;
  schoolYear: string | null;
  method: string;
  refundedOn?: string | null;
  remaining?: number | null;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  return await send({
    lang,
    to: opts.to,
    subject: t.refund.subject(opts.childName),
    badge: t.refund.badge,
    title: t.refund.title,
    intro:
      opts.method === "vipps"
        ? `${t.refund.intro(opts.childName)} ${t.refund.vippsNote}`
        : t.refund.intro(opts.childName),
    rows: [
      [t.rows.student, opts.childName],
      [t.rows.schoolYear, opts.schoolYear],
      [t.rows.amountRefunded, formatNok(opts.amount)],
      [t.rows.paidOn, formatDueDate(opts.refundedOn, lang)],
      [t.rows.method, t.methods[opts.method] ?? null],
      [t.rows.remaining, opts.remaining != null ? formatNok(opts.remaining) : null],
    ],
  });
}

export async function sendStudentApplicationEmail(opts: {
  to: string;
  childName: string;
  rows: Row[];
  replyTo?: string | null;
}) {
  await send({
    lang: "no",
    to: opts.to,
    subject: `Ny påmelding: ${opts.childName}`,
    replyTo: opts.replyTo,
    badge: "Påmelding",
    title: "Ny påmelding av elev",
    intro: "En ny elev er meldt på via nettsiden.",
    rows: opts.rows,
  });
}

export async function sendTeacherApplicationEmail(opts: {
  to: string;
  fullName: string;
  rows: Row[];
  replyTo?: string | null;
}) {
  await send({
    lang: "no",
    to: opts.to,
    subject: `Ny lærersøknad: ${opts.fullName}`,
    replyTo: opts.replyTo,
    badge: "Lærer",
    title: "Ny lærersøknad",
    intro: "Noen ønsker å bli lærer eller frivillig hos Islamskole Bærum.",
    rows: opts.rows,
  });
}

export async function sendWelcomeEmail(opts: {
  to: string | string[];
  childName: string;
  className: string | null;
  schoolYear: string | null;
  startsOn?: string | null;
  address?: string | null;
  hours?: string | null;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  return await send({
    lang,
    to: opts.to,
    subject: t.welcome.subject(opts.childName),
    badge: t.welcome.badge,
    title: t.welcome.title,
    intro: t.welcome.intro(opts.childName, opts.className),
    rows: [
      [t.rows.student, opts.childName],
      [t.rows.class, opts.className],
      [t.rows.schoolYear, opts.schoolYear],
      [t.rows.startsOn, formatDueDate(opts.startsOn, lang)],
      [t.rows.hours, opts.hours],
      [t.rows.address, opts.address],
    ],
  });
}

export async function sendLoginLinkEmail(opts: {
  to: string;
  url: string;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  return await send({
    lang,
    to: opts.to,
    subject: t.loginLink.subject,
    badge: t.loginLink.badge,
    title: t.loginLink.title,
    intro: t.loginLink.intro,
    note: t.loginLink.note,
    cta: { label: t.loginLink.cta, url: opts.url },
    rows: [],
  });
}

export async function sendEmailChangeConfirmation(opts: {
  to: string;
  url: string;
  name: string;
  lang?: EmailLang;
}): Promise<boolean> {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  return await send({
    lang,
    to: opts.to,
    subject: t.emailChange.subject,
    badge: t.emailChange.badge,
    title: t.emailChange.title,
    intro: t.emailChange.intro(opts.name),
    note: t.emailChange.note,
    cta: { label: t.emailChange.cta, url: opts.url },
    rows: [],
  });
}

export async function sendTeacherApplicationConfirmationEmail(opts: {
  to: string;
  fullName: string;
  lang?: EmailLang;
}) {
  const lang = opts.lang ?? "no";
  const t = strings(lang);
  await send({
    lang,
    to: opts.to,
    subject: t.teacherConfirmation.subject,
    badge: t.teacherConfirmation.badge,
    title: t.teacherConfirmation.title,
    intro: t.teacherConfirmation.intro(opts.fullName),
    rows: [],
  });
}

export type AnnouncementEmail = {
  to: string;
  lang: EmailLang;
  title: string;
  body: string;
  url: string;
  requiresAcknowledgement: boolean;
};

function announcementEmailContent(opts: AnnouncementEmail) {
  return {
    lang: opts.lang,
    badge: opts.lang === "en" ? "School announcement" : "Beskjed fra skolen",
    title: opts.title,
    intro: opts.body,
    rows: [] as Row[],
    note: opts.requiresAcknowledgement
      ? opts.lang === "en" ? "One guardian needs to acknowledge this for your family." : "Én foresatt må bekrefte beskjeden på vegne av familien."
      : undefined,
    cta: { label: opts.lang === "en" ? "Open announcement" : "Åpne beskjeden", url: opts.url },
  };
}

export async function sendAnnouncementEmails(emails: AnnouncementEmail[], batchId: string): Promise<boolean[]> {
  const messages = emails.map((email) => {
    const content = announcementEmailContent(email);
    return { to: email.to, subject: email.title, html: renderEmail(content), text: renderText(content), links: [email.url] };
  });
  const outbox = process.env.EMAIL_OUTBOX_DIR;
  if (outbox) return Promise.all(messages.map((message) => writeOutbox(outbox, message)));
  const resend = getClient();
  if (!resend) return messages.map(() => false);
  const { data, error } = await resend.batch.send(
    messages.map(({ to, subject, html, text }) => ({ from: FROM, to, subject, html, text })),
    { batchValidation: "permissive", idempotencyKey: `announcement-batch-${batchId}` },
  );
  if (error || !data) {
    console.error("Announcement email batch failed", { batchId, error });
    return messages.map(() => false);
  }
  const failures = new Set(data.errors?.map((failure) => failure.index));
  if (data.data.length + failures.size !== messages.length) {
    console.error("Announcement email batch returned incomplete results", { batchId });
    return messages.map(() => false);
  }
  return messages.map((_, index) => !failures.has(index));
}
