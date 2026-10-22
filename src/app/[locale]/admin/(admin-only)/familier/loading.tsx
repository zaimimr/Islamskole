import { Skeleton } from "@/components/ui/skeleton";
import {
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function FamilierLoading() {
  return (
    <PageSkeleton label="Laster familier …" className="gap-4 sm:gap-6 lg:gap-6">
      <HeaderSkeleton actions={2} />
      <FamilyListSkeleton />
    </PageSkeleton>
  );
}

export function FamilyListSkeleton() {
  return (
    <>
    <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-24 rounded-xl" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-28 shrink-0 rounded-full" />
        ))}
      </div>
    </div>
    <Skeleton className="h-4 w-40 rounded-lg" />
    <div className="grid gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-[#E3DED3] sm:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)_auto] sm:items-center sm:gap-4 sm:p-5"
        >
          <div className="grid gap-2">
            <Skeleton className="h-5 w-44 max-w-full rounded-lg" />
            <Skeleton className="h-4 w-56 max-w-full rounded-lg" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-4 w-36 max-w-full rounded-lg" />
            <Skeleton className="h-4 w-48 max-w-full rounded-lg" />
          </div>
          <Skeleton className="h-6 w-24 rounded-lg" />
        </div>
      ))}
    </div>
    </>
  );
}
