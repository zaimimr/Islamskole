import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function PortalLoading() {
  const t = await getTranslations("common");
  return (
    <div className="grid gap-6" role="status" aria-live="polite">
      <span className="sr-only">{t("loading")}</span>
      <Skeleton className="h-9 w-56 max-w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
