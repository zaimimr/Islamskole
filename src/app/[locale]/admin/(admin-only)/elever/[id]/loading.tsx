import {
  CardSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
  StatStripSkeleton,
} from "@/components/admin/admin-skeletons";

export default function ElevLoading() {
  return (
    <PageSkeleton label="Laster elev …" className="gap-5 sm:gap-6 lg:gap-6">
      <HeaderSkeleton back actions={2} description={false} />
      <StatStripSkeleton stacked />
      <CardSkeleton />
      <ListCardSkeleton rows={2} />
      <CardSkeleton />
    </PageSkeleton>
  );
}
