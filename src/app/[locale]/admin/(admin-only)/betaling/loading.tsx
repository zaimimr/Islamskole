import { Skeleton } from "@/components/ui/skeleton";
import {
  HeaderSkeleton,
  PageSkeleton,
  StatStripSkeleton,
} from "@/components/admin/admin-skeletons";

export default function BetalingLoading() {
  return (
    <PageSkeleton label="Laster økonomi …" className="gap-7 lg:gap-8">
      <HeaderSkeleton />
      <div>
        <Skeleton className="mb-3 h-6 w-24 rounded-lg" />
        <StatStripSkeleton stacked />
      </div>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3]">
        <div className="flex items-center justify-between gap-4 border-b border-[#ECE8DF] px-4 py-5 sm:px-6">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="hidden h-11 w-40 rounded-xl sm:block" />
        </div>
        <div className="grid gap-6 p-4 sm:p-6">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="divide-y divide-[#E8E3D9] overflow-hidden rounded-xl ring-1 ring-[#E8E3D9]">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="flex min-h-16 items-center justify-between gap-4 px-4 py-3"
              >
                <div className="grid gap-2">
                  <Skeleton className="h-4 w-44 max-w-full rounded-lg" />
                  <Skeleton className="h-3 w-28 rounded-lg" />
                </div>
                <Skeleton className="h-5 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageSkeleton>
  );
}
