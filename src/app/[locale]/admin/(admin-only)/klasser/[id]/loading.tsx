import {
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
  TabsSkeleton,
} from "@/components/admin/admin-skeletons";

export default function KlasseLoading() {
  return (
    <PageSkeleton label="Laster klasse …">
      <HeaderSkeleton back />
      <TabsSkeleton />
      <ListCardSkeleton rows={2} />
      <ListCardSkeleton rows={6} />
    </PageSkeleton>
  );
}
