import {
  FormSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function RedigerFamilieLoading() {
  return (
    <PageSkeleton label="Laster skjema …" className="gap-5 lg:gap-5">
      <HeaderSkeleton back />
      <FormSkeleton sections={2} />
    </PageSkeleton>
  );
}
