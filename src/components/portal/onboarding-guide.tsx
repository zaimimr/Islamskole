"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { onboardingGuide, type OnboardingRole } from "@/lib/school-emails/content";
import { completePortalOnboarding } from "@/lib/school-emails/onboarding-actions";

export function PortalOnboardingGuide({ locale, role }: { locale: string; role: OnboardingRole }) {
  const [completed, setCompleted] = useState(false);
  const [pending, startTransition] = useTransition();
  const guide = onboardingGuide(locale, role);
  if (completed) return null;
  return (
    <section aria-labelledby={`onboarding-${role}`} className="rounded-2xl bg-primary/8 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-prose gap-2">
          <h2 id={`onboarding-${role}`} className="font-heading text-2xl font-semibold">{guide.title}</h2>
          <p className="text-pretty text-foreground/80">{guide.login}</p>
        </div>
        <Button disabled={pending} onClick={() => startTransition(async () => {
          const result = await completePortalOnboarding(role);
          if (result.ok) setCompleted(true);
          else toast.error(guide.error);
        })}>{guide.done}</Button>
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2">
        {guide.items.map((item) => (
          <div key={item.label} className="grid gap-1">
            <dt><Link href={item.href} className="inline-flex min-h-11 items-center rounded-sm font-semibold text-brand-green-dark underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{item.label}</Link></dt>
            <dd className="max-w-prose text-pretty text-sm text-foreground/80">{item.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
