import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function ReconciliationLoading() {
  return (
    <PageSkeleton label="Laster avstemming …">
      <HeaderSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={6} head={false} />
    </PageSkeleton>
  );
}
