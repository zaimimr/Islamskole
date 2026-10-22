import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "@/components/admin/admin-skeletons";

function SideCard() {
  return (
    <div className="grid content-start gap-3 rounded-2xl bg-white p-5 ring-1 ring-[#E3DED3]">
      <Skeleton className="h-7 w-32 rounded-lg" />
      <Skeleton className="h-4 w-full rounded-lg" />
      <Skeleton className="h-4 w-4/5 rounded-lg" />
      <div className="mt-2 grid gap-2 border-t border-[#ECE8DF] pt-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}

export default function FamilieLoading() {
  return (
    <PageSkeleton label="Laster familie …" className="gap-5 lg:gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(14rem,0.72fr)_minmax(0,2.25fr)_minmax(15rem,0.82fr)]">
        <div className="order-3 xl:order-1">
          <SideCard />
        </div>
        <div className="order-1 overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3DED3] xl:order-2">
          <div className="grid gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
            <Skeleton className="h-9 w-60 max-w-full rounded-lg" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="mt-2 h-20 w-full rounded-xl" />
            <div className="mt-2 flex gap-3 border-b border-[#ECE8DF] pb-3">
              <Skeleton className="h-5 w-20 rounded-lg" />
              <Skeleton className="h-5 w-20 rounded-lg" />
              <Skeleton className="h-5 w-20 rounded-lg" />
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:p-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
        <div className="order-2 xl:order-3">
          <SideCard />
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-4 rounded-2xl bg-white px-4 py-4 ring-1 ring-[#E3DED3]">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="grid gap-2">
            <Skeleton className="h-3 w-20 rounded-lg" />
            <Skeleton className="h-7 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
