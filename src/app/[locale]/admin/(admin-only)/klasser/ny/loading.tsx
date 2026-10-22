import {
  FormSkeleton,
  HeaderSkeleton,
  PageSkeleton,
} from "@/components/admin/admin-skeletons";

export default function NyKlasseLoading() {
  return (
    <PageSkeleton label="Laster skjema …">
      <HeaderSkeleton back />
      <FormSkeleton sections={2} />
    </PageSkeleton>
  );
}
