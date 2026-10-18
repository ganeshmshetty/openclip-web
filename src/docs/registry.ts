import { DocCategory, DocItem } from './types';
import docsPayload from './data/docsData.json';

export const docCategories: DocCategory[] = docsPayload.categories as DocCategory[];

export const allDocs: DocItem[] = docsPayload.allDocs as DocItem[];

export function getDocById(id: string): DocItem | undefined {
  if (!id) return undefined;
  const cleanId = id.toLowerCase().trim();
  return allDocs.find(
    (doc) =>
      doc.id.toLowerCase() === cleanId ||
      doc.slug.toLowerCase() === cleanId
  );
}

export function getAdjacentDocs(currentId: string): { prev?: DocItem; next?: DocItem } {
  const index = allDocs.findIndex(
    (doc) => doc.id === currentId || doc.slug === currentId
  );
  if (index === -1) return {};
  return {
    prev: index > 0 ? allDocs[index - 1] : undefined,
    next: index < allDocs.length - 1 ? allDocs[index + 1] : undefined,
  };
}

export function searchDocs(query: string): DocItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return allDocs;

  return allDocs.filter((doc) => {
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.description.toLowerCase().includes(q) ||
      doc.category.toLowerCase().includes(q) ||
      doc.headings.some((h) => h.title.toLowerCase().includes(q)) ||
      (doc.rawMarkdown && doc.rawMarkdown.toLowerCase().includes(q))
    );
  });
}
