export type OnboardingRole = "parent" | "student";
export type SchoolEmailKind = "signup_parent" | "signup_student" | "welcome_parent" | "welcome_student" | "plan_confirmed" | "payment_reminder" | "installment_due" | "installment_reminder" | "report_published" | "attendance_followup" | "activity_consent" | "activity_cancelled" | "activity_added" | "activity_changed" | "activity_respond_reminder" | "activity_payment_reminder";

const GUIDES = {
  no: {
    title: "Slik bruker du Min side",
    login: "Logg inn med e-postadressen din. Du får en innloggingslenke på e-post og trenger ikke passord.",
    parent: [
      { label: "Mine barn", text: "Se klasser, søndagens timer, lekser og læringsutvikling.", href: "/min-side" },
      { label: "Meld fravær", text: "Velg barnet og søndagen barnet ikke kommer, fra Min side.", href: "/min-side" },
      { label: "Familie", text: "Oppdater kontaktopplysninger, allergier og hvem som kan hente.", href: "/min-side/familie" },
      { label: "Økonomi", text: "Se betalinger og avdrag, betal med Vipps og hent kvitteringer.", href: "/min-side/okonomi" },
      { label: "Aktiviteter og rapporter", text: "Velg barnet for å svare på aktivitetssamtykke, se deltakelse og lese publiserte semesterrapporter.", href: "/min-side" },
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
      { label: "Activities and reports", text: "Choose your child to respond to activity consent, see participation and read published term reports.", href: "/min-side" },
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
  activityId?: string;
  activityTitle?: string;
  activityDate?: string;
  activityDeadline?: string;
  activityStudentId?: string;
  activitySfo?: boolean;
  activityNeedsConsent?: boolean;
  activityTime?: string;
  activityLocation?: string;
  activityPrevious?: string;
  activityRefund?: string;
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
  if (input.kind.startsWith("activity") && input.activitySfo) {
    const href = input.activityStudentId ? `/min-side/barn/${input.activityStudentId}#activities` : "/min-side";
    const when: [string, string][] = [[en ? "Date" : "Dato", input.activityDate ?? ""], ...(input.activityTime ? [[en ? "Time" : "Tid", input.activityTime] as [string, string]] : []),
      ...(input.activityLocation ? [[en ? "Place" : "Sted", input.activityLocation] as [string, string]] : [])];
    const open = en ? "Open activity" : "Åpne aktivitet";
    if (input.kind === "activity_cancelled") return {
      subject: en ? "Activity cancelled" : "Aktivitet avlyst", title: input.activityTitle ?? "",
      intro: en ? `The activity for ${names} has been cancelled.` : `Aktiviteten for ${names} er avlyst.`,
      rows: [[en ? "Date" : "Dato", input.activityDate ?? ""], ...(input.activityRefund !== undefined ? [[en ? "Refund per child" : "Tilbakebetaling per barn", input.activityRefund || (en ? "None" : "Ingen")] as [string, string]] : [])] as [string, string][],
      href, ctaLabel: open,
    };
    if (input.kind === "activity_changed") return {
      subject: en ? "Activity changed" : "Endring i aktivitet", title: input.activityTitle ?? "",
      intro: en ? `Time or place has changed for ${names}.` : `Tid eller sted er endret for ${names}.`,
      rows: [...when, ...(input.activityPrevious ? [[en ? "Before" : "Før", input.activityPrevious] as [string, string]] : [])] as [string, string][],
      href, ctaLabel: open,
    };
    if (input.kind === "activity_payment_reminder") return {
      subject: en ? "Reminder: activity payment" : "Påminnelse om betaling for aktivitet", title: input.activityTitle ?? "",
      intro: en ? `Payment for ${names} is not registered yet.` : `Betaling for ${names} er ikke registrert ennå.`,
      rows: [[en ? "Amount" : "Beløp", input.amount ?? ""], [en ? "Due date" : "Betalingsfrist", input.dueDate ?? ""], ...when] as [string, string][],
      href, ctaLabel: en ? "Pay with Vipps" : "Betal med Vipps",
    };
    const reminder = input.kind === "activity_respond_reminder";
    return {
      subject: reminder ? (en ? "Reminder: activity sign-up" : "Påminnelse om påmelding") : (en ? "New activity" : "Ny aktivitet"), title: input.activityTitle ?? "",
      intro: input.activityNeedsConsent ? (en ? `Read the consent statement on Min side and respond for ${names}.` : `Les samtykketeksten på Min side og svar for ${names}.`)
        : (en ? `Respond on Min side for ${names}.` : `Svar på Min side for ${names}.`),
      rows: [...when, [en ? "Response deadline" : "Svarfrist", input.activityDeadline ?? ""], ...(input.amount ? [[en ? "Price" : "Pris", input.amount] as [string, string]] : [])] as [string, string][],
      href, ctaLabel: open,
    };
  }
  if (input.kind.startsWith("activity")) {
    const cancelled = input.kind === "activity_cancelled";
    return {
      subject: en ? (cancelled ? "School activity cancelled" : "Guardian consent requested for a school activity") : (cancelled ? "Skoleaktivitet avlyst" : "Samtykke til skoleaktivitet"),
      title: input.activityTitle ?? "",
      intro: cancelled ? (en ? `The activity for ${names} has been cancelled.` : `Aktiviteten for ${names} er avlyst.`)
        : (en ? `Please read the activity details and consent statement on Min side and respond separately for ${names}.` : `Les om aktiviteten og samtykketeksten på Min side, og svar for hvert barn: ${names}.`),
      rows: [[en ? "Date" : "Dato", input.activityDate ?? ""], ...(cancelled ? [] : [[en ? "Response deadline" : "Svarfrist", input.activityDeadline ?? ""]])] as [string, string][],
      href: input.activityStudentId ? `/min-side/barn/${input.activityStudentId}#activities` : "/min-side",
      ctaLabel: en ? "Open activity" : "Åpne aktivitet",
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
