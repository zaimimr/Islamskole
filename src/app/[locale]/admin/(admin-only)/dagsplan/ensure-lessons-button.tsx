"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Loader2 } from "lucide-react";
import { ensureDayLessons } from "@/app/[locale]/admin/lesson-actions";
import { Button } from "@/components/ui/button";

export function EnsureLessonsButton({ schoolDayId }: { schoolDayId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await ensureDayLessons(schoolDayId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(result.count ? `La til ${result.count} timer` : "Alle timer finnes allerede");
          router.refresh();
        })
      }
      className="min-h-11 rounded-xl bg-admin-action px-4 font-bold text-white hover:bg-[#245E2B]"
    >
      {pending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <CalendarPlus aria-hidden="true" className="size-4" />}
      Lag timer fra timeplanene
    </Button>
  );
}
