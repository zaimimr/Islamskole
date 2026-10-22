import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function AvdragLoading() {
  return (
    <PageSkeleton label="Laster avdrag …">
      <HeaderSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={6} head={false} />
    </PageSkeleton>
  );
}
