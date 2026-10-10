import { useTranslations } from "next-intl";
import { Check, RotateCcw, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, { icon: typeof Check; color: string }> = {
  practising: { icon: BookOpen, color: "bg-muted text-foreground" },
  achieved: { icon: Check, color: "bg-primary/12 text-brand-green-dark" },
  needs_revision: { icon: RotateCcw, color: "bg-secondary text-secondary-foreground" },
};

export function ProgressStatus({ status }: { status: string }) {
  const t = useTranslations("learningProgress");
  const style = statusStyles[status] ?? statusStyles.practising;
  const Icon = style.icon;
  return <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", style.color)}><Icon aria-hidden="true" className="size-4" />{t(`statuses.${status}`)}</span>;
}

export function ProgressDetails({ feedback, nextTarget }: { feedback: string | null; nextTarget: string | null }) {
  const t = useTranslations("learningProgress");
  return (
    <dl className="grid max-w-prose gap-3">
      {feedback ? <div className="grid gap-1"><dt className="text-sm font-semibold text-muted-foreground">{t("feedback")}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{feedback}</dd></div> : null}
      {nextTarget ? <div className="grid gap-1"><dt className="text-sm font-semibold text-brand-green-dark">{t("nextTarget")}</dt><dd className="whitespace-pre-wrap wrap-anywhere">{nextTarget}</dd></div> : null}
    </dl>
  );
}

export function progressDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nb-NO", {
    timeZone: "Europe/Oslo", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}
