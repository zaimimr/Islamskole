import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
  StatStripSkeleton,
} from "@/components/admin/admin-skeletons";

export default function RegisterLoading() {
  return (
    <PageSkeleton label="Laster opptak …" className="gap-4 sm:gap-6 lg:gap-6">
      <HeaderSkeleton actions={1} />
      <StatStripSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={4} tall />
    </PageSkeleton>
  );
}
