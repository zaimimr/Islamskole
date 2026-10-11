import Link from "next/link";

export function SectionNavigation({ label, current, items }: {
  label: string;
  current: string;
  items: { id: string; label: string; href: string }[];
}) {
  return <nav aria-label={label} className="sticky top-20 z-10 grid grid-cols-2 gap-1 border-b border-[#E3DED3] bg-background py-1 sm:flex sm:flex-wrap print:hidden">
    {items.map((item) => <Link key={item.id} href={item.href} aria-current={current === item.id ? "page" : undefined}
      className="relative inline-flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-bold text-admin-muted outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-white aria-[current=page]:text-admin-action aria-[current=page]:after:absolute aria-[current=page]:after:right-3 aria-[current=page]:after:bottom-0 aria-[current=page]:after:left-3 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-admin-action">
      {item.label}
    </Link>)}
  </nav>;
}
