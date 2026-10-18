import { permanentRedirect } from 'next/navigation';
import { getDocById } from '@/docs/registry';

interface Props {
  searchParams: Promise<{ doc?: string }>;
}

export default async function DocsPage({ searchParams }: Props) {
  const { doc } = await searchParams;
  if (doc) {
    const target = getDocById(doc);
    if (target) permanentRedirect(`/docs/${target.slug}`);
  }
  permanentRedirect('/docs/getting-started');
}