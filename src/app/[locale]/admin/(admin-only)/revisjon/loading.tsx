import {
  FilterSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function RevisjonLoading() {
  return (
    <PageSkeleton label="Laster revisjonshistorikk …">
      <HeaderSkeleton />
      <FilterSkeleton />
      <ListCardSkeleton rows={8} head={false} />
    </PageSkeleton>
  );
}
