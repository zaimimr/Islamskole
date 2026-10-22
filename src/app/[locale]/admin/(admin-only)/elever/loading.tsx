import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
  StatStripSkeleton,
} from "@/components/admin/admin-skeletons";

export default function EleverLoading() {
  return (
    <PageSkeleton label="Laster elever …" className="gap-4 sm:gap-6 lg:gap-6">
      <HeaderSkeleton actions={1} />
      <StatStripSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={8} />
    </PageSkeleton>
  );
}
