import { cn } from "@/lib/utils";

export function NoticeBadge({ notified }: { notified: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-bold",
        notified ? "bg-[#DCEDDD] text-[#216A2B]" : "bg-[#F9DEDB] text-[#8B2F2B]",
      )}
    >
      {notified ? "Varslet" : "Ikke varslet"}
    </span>
  );
}
