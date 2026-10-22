import {
  FormSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function NyElevLoading() {
  return (
    <PageSkeleton label="Laster skjema …" className="gap-5 sm:gap-6 lg:gap-6">
      <HeaderSkeleton back />
      <FormSkeleton sections={3} />
    </PageSkeleton>
  );
}
