import React from 'react';

export interface DocHeading {
  id: string;
  title: string;
  level: 2 | 3;
}

export interface DocItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  categorySlug: string;
  description: string;
  order: number;
  sourcePath?: string;
  headings: DocHeading[];
  rawMarkdown?: string;
  content?: React.ReactNode;
}

export interface DocCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  items: DocItem[];
}
