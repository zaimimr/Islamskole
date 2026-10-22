import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function RabatterLoading() {
  return (
    <PageSkeleton label="Laster rabatter …">
      <HeaderSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={6} head={false} />
    </PageSkeleton>
  );
}
