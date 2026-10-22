import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function DobbeltforingerLoading() {
  return (
    <PageSkeleton label="Laster dobbeltføringer …">
      <HeaderSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={6} head={false} />
    </PageSkeleton>
  );
}
