import dynamic from "next/dynamic";
import { ContentSkeleton } from "@/components/layout";

const ProductsPage = dynamic(
  () => import("@/features/products").then((m) => ({ default: m.ProductsPage })),
  { loading: () => <ContentSkeleton /> }
);

type PageProps = {
  params: Promise<{ categoryId: string; groupId: string }>;
};

/** Воронка облікової групи: ті ж товари, що й у категорії, відфільтровані за групою статусу. */
export default async function CatalogAccountingGroupPage({ params }: PageProps) {
  const { categoryId, groupId } = await params;
  return <ProductsPage categoryId={categoryId} accountingGroupId={groupId} />;
}
