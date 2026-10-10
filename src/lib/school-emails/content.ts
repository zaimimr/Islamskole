export type OnboardingRole = "parent" | "student";
export type SchoolEmailKind = "signup_parent" | "signup_student" | "welcome_parent" | "welcome_student" | "plan_confirmed" | "payment_reminder" | "installment_due" | "installment_reminder" | "report_published" | "attendance_followup";

const GUIDES = {
  no: {
    title: "Slik bruker du Min side",
    login: "Logg inn med e-postadressen din. Du får en innloggingslenke på e-post og trenger ikke passord.",
    parent: [
      { label: "Mine barn", text: "Se klasser, søndagens timer, lekser og læringsutvikling.", href: "/min-side" },
      { label: "Meld fravær", text: "Velg barnet og søndagen barnet ikke kommer, fra Min side.", href: "/min-side" },
      { label: "Familie", text: "Oppdater kontaktopplysninger, allergier og hvem som kan hente.", href: "/min-side/familie" },
      { label: "Økonomi", text: "Se betalinger og avdrag, betal med Vipps og hent kvitteringer.", href: "/min-side/okonomi" },
      { label: "Beskjeder", text: "Les beskjeder og bekreft viktige beskjeder for familien.", href: "/min-side/beskjeder" },
    ],
    student: [
      { label: "Min klasse", text: "Se klassen din og timene neste skolesøndag.", href: "/min-side" },
      { label: "Lekser og ukeplan", text: "Se hva du skal øve på og hva klassen skal lære.", href: "/min-side#student-semester-plan" },
      { label: "Læringsutvikling", text: "Se målene dine, tilbakemeldinger og hva du skal øve på videre.", href: "/min-side" },
    ],
    done: "Jeg er klar",
    error: "Kunne ikke lagre. Prøv igjen.",
  },
  en: {
    title: "Getting started with Min side",
    login: "Sign in with your email address. We email you a sign-in link, so you do not need a password.",
    parent: [
      { label: "My children", text: "See classes, Sunday lessons, homework and learning progress.", href: "/min-side" },
      { label: "Report absence", text: "Choose your child and the Sunday they will miss from Min side.", href: "/min-side" },
      { label: "Family", text: "Update contact details, allergies and authorised pickup contacts.", href: "/min-side/familie" },
      { label: "Payments", text: "See payments and installments, pay with Vipps and get receipts.", href: "/min-side/okonomi" },
      { label: "Announcements", text: "Read messages and acknowledge important announcements for your family.", href: "/min-side/beskjeder" },
    ],
    student: [
      { label: "My class", text: "See your class and lessons for the next school Sunday.", href: "/min-side" },
      { label: "Homework and weekly plan", text: "See what to practise and what your class will learn.", href: "/min-side#student-semester-plan" },
      { label: "Learning progress", text: "See your goals, teacher feedback and what to practise next.", href: "/min-side" },
    ],
    done: "I'm ready",
    error: "Could not save. Please try again.",
  },
};

export function onboardingGuide(locale: string, role: OnboardingRole) {
  const copy = GUIDES[locale === "en" ? "en" : "no"];
  return { title: copy.title, login: copy.login, items: copy[role], done: copy.done, error: copy.error };
}

export function schoolEmailContent(input: {
  kind: SchoolEmailKind;
  locale: string;
  names: string[];
  schedule?: { date: string; amount: string }[];
  amount?: string;
  dueDate?: string;
  paymentId?: string;
  publicationId?: string;
  followUpMessage?: string;
}) {
  const en = input.locale === "en";
  const names = input.names.join(", ");
  const role = input.kind.endsWith("student") ? "student" : "parent";
  const guide = onboardingGuide(input.locale, role);
  const rows: [string, string][] = [];
  if (input.kind.startsWith("signup")) {
    return {
      subject: en ? "We have received your school application" : "Vi har mottatt påmeldingen",
      title: en ? "Application received" : "Påmelding mottatt",
      intro: en
        ? `We have received the application for ${names}. The school will review the application and confirm class placement. Applying does not confirm a place or payment.`
        : `Vi har mottatt påmeldingen for ${names}. Skolen behandler påmeldingen og bekrefter klasseplasseringen. Påmelding er ikke en bekreftelse på plass eller betaling.`,
      rows,
      note: en ? "We will email you how to use Min side when your access is ready." : "Du får en e-post om hvordan du bruker Min side når tilgangen er klar.",
      href: null,
      ctaLabel: "",
    };
  }
  if (input.kind.startsWith("welcome")) {
    return {
      subject: en ? "Welcome to Min side at Islamskole Bærum" : "Velkommen til Min side på Islamskole Bærum",
      title: guide.title,
      intro: `${en ? `Min side is ready for ${names}.` : `Min side er klar for ${names}.`}\n\n${guide.login}`,
      rows: guide.items.map((item): [string, string] => [item.label, item.text]),
      href: "/min-side/logg-inn",
      ctaLabel: en ? "Open Min side" : "Åpne Min side",
    };
  }
  if (input.kind === "attendance_followup") {
    return {
      subject: en ? "Attendance follow-up from Islamskole" : "Fraværsoppfølging fra Islamskole",
      title: en ? "Attendance follow-up" : "Fraværsoppfølging",
      intro: input.followUpMessage ?? "", rows, href: "/min-side",
      ctaLabel: en ? "Open Min side" : "Åpne Min side",
    };
  }
  if (input.kind === "report_published") {
    return {
      subject: en ? "Your child's end-of-term report is ready" : "Semesterrapporten til barnet ditt er klar",
      title: en ? "End-of-term report published" : "Semesterrapport publisert",
      intro: en ? `A report for ${names} is available on Min side.` : `En rapport for ${names} er tilgjengelig på Min side.`,
      rows,
      href: `/min-side/rapporter/${input.publicationId}`,
      ctaLabel: en ? "Read report" : "Les rapport",
    };
  }
  if (input.kind === "plan_confirmed") {
    return {
      subject: en ? "Your school fee installment plan" : "Avtalt betalingsplan for skoleavgiften",
      title: en ? "Your installment plan" : "Betalingsplanen din",
      intro: en ? `The school has arranged the following installments for ${names}. Payment links arrive before each due date.` : `Skolen har satt opp følgende avdrag for ${names}. Du får betalingslenker før hver frist.`,
      rows: (input.schedule ?? []).map((slot): [string, string] => [slot.date, slot.amount]),
      href: "/min-side/okonomi",
      ctaLabel: en ? "See installment plan" : "Se betalingsplan",
    };
  }
  if (input.kind.startsWith("installment")) {
    const reminder = input.kind === "installment_reminder";
    return {
      subject: en ? (reminder ? "Reminder: school fee installment" : "Your next school fee installment") : (reminder ? "Påminnelse om avdrag på skoleavgiften" : "Neste avdrag på skoleavgiften"),
      title: en ? (reminder ? "Installment reminder" : "School fee installment") : (reminder ? "Påminnelse om avdrag" : "Avdrag på skoleavgiften"),
      intro: en ? `${reminder ? "The installment is overdue" : "Your next installment is ready"} for ${names}. Open the payment link to pay with Vipps.` : `${reminder ? "Betalingsfristen for avdraget har gått ut" : "Neste avdrag er klart"} for ${names}. Åpne betalingslenken for å betale med Vipps.`,
      rows: [[en ? "Amount" : "Beløp", input.amount ?? ""], [en ? "Due date" : "Betalingsfrist", input.dueDate ?? ""]] as [string, string][],
      href: input.paymentId ? `/api/vipps/pay/${input.paymentId}?locale=${en ? "en" : "no"}` : "/min-side/okonomi",
      ctaLabel: en ? "Pay with Vipps" : "Betal med Vipps",
    };
  }
  return {
    subject: en ? "Reminder: unpaid school fee" : "Påminnelse om ubetalt skoleavgift",
    title: en ? "Payment reminder" : "Betalingspåminnelse",
    intro: en ? `The school fee payment for ${names} is overdue. Open Min side to see the payment and pay with Vipps.` : `Betalingsfristen for skoleavgiften til ${names} har gått ut. Åpne Min side for å se betalingen og betale med Vipps.`,
    rows: [[en ? "Amount" : "Beløp", input.amount ?? ""], [en ? "Due date" : "Betalingsfrist", input.dueDate ?? ""]] as [string, string][],
    href: "/min-side/okonomi",
    ctaLabel: en ? "See payment" : "Se betaling",
  };
}
