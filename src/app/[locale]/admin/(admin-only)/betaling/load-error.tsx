import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export function FinanceLoadError({
  title,
  retryHref,
}: {
  title: string;
  retryHref: string;
}) {
  return (
    <section
      aria-labelledby="finance-load-error"
      className="mx-auto max-w-2xl rounded-2xl bg-white p-6 ring-1 ring-[#E3DED3]"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-[#F9DEDB] text-[#8B2F2B]">
        <AlertTriangle aria-hidden="true" className="size-5" />
      </span>
      <h1
        id="finance-load-error"
        className="mt-4 font-heading text-3xl font-bold tracking-[-0.02em]"
      >
        {title}
      </h1>
      <p className="mt-2 max-w-prose text-admin-muted">
        Tallene er ikke erstattet med null. Last siden på nytt før du bruker
        oversikten.
      </p>
      <Link
        href={retryHref}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-admin-action px-4 text-sm font-bold text-white outline-none transition-colors hover:bg-[#27672F] focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Prøv igjen
      </Link>
    </section>
  );
}
