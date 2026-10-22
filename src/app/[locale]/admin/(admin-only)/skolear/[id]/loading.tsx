import {
  CardSkeleton,
  HeaderSkeleton,
  ListCardSkeleton,
  PageSkeleton,
  StatStripSkeleton,
} from "@/components/admin/admin-skeletons";

export default function SkolearDetaljLoading() {
  return (
    <PageSkeleton label="Laster skoleår …">
      <HeaderSkeleton back />
      <StatStripSkeleton stacked />
      <ListCardSkeleton rows={4} />
      <CardSkeleton />
    </PageSkeleton>
  );
}
