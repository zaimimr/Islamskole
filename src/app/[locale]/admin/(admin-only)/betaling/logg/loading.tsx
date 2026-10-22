import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function BetalingsloggLoading() {
  return (
    <PageSkeleton label="Laster betalingslogg …">
      <HeaderSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={6} head={false} />
    </PageSkeleton>
  );
}
