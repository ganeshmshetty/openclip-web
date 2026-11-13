import fs from 'node:fs';
import path from 'node:path';
import { EDGE_CACHE_5_MIN } from './edge-cache';

export interface ReleaseItem {
  raw: string;
  title?: string;
  description: string;
}

export interface ReleaseSection {
  title: string;
  items: ReleaseItem[];
  paragraphs: string[];
}

export interface ChangelogRelease {
  version: string;
  rawVersion: string;
  tag: string;
  date: string;
  displayDate: string;
  intro?: string;
  sections: ReleaseSection[];
}

export interface ChangelogData {
  title: string;
  description: string;
  releases: ChangelogRelease[];
}

const GITHUB_CHANGELOG_URL =
  'https://raw.githubusercontent.com/ganeshmshetty/openclip/main/CHANGELOG.md';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const CHANGELOG_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache
let cachedChangelog: ChangelogData | null = null;
let cachedChangelogAt = 0;

function formatDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }
  }
  return trimmed;
}

function parseItem(line: string): ReleaseItem {
  const cleanLine = line.replace(/^[-*]\s+/, '').trim();

  // Check for **Title**: Description or **Title** - Description pattern
  const titleMatch = cleanLine.match(/^\*\*([^*]+)\*\*(?::| -)\s*([\s\S]+)$/);
  if (titleMatch) {
    return {
      raw: cleanLine,
      title: titleMatch[1].trim(),
      description: titleMatch[2].trim(),
    };
  }

  // Check for **Title** without colon
  const boldPrefixMatch = cleanLine.match(/^\*\*([^*]+)\*\*\s*([\s\S]*)$/);
  if (boldPrefixMatch && boldPrefixMatch[2]) {
    return {
      raw: cleanLine,
      description: cleanLine,
    };
  }

  return {
    raw: cleanLine,
    description: cleanLine,
  };
}

export function parseChangelogContent(content: string): ChangelogData {
  const lines = content.split(/\r?\n/);
  let title = 'Changelog';
  let description = 'All notable user-facing changes, feature additions, and improvements to OpenClip are documented here.';
  const releases: ChangelogRelease[] = [];

  let currentRelease: ChangelogRelease | null = null;
  let currentSection: ReleaseSection | null = null;
  let inHeader = true;
  const headerDescLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed === '---') {
      continue;
    }

    // Top-level # Header
    if (line.startsWith('# ') && inHeader) {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }

    // Release header ## v1.0.1 - 2026-08-22
    const releaseMatch = line.match(/^##\s+\[?(v?[\d\w.-]+)\]?(?:\s*[-–—(]\s*([\d\w\s,.-]+)\)?)?/i);
    if (releaseMatch) {
      inHeader = false;
      const rawVersionStr = releaseMatch[1];
      const version = rawVersionStr.startsWith('v') ? rawVersionStr : `v${rawVersionStr}`;
      const rawVersion = rawVersionStr.replace(/^v/, '');
      const rawDate = releaseMatch[2] ? releaseMatch[2].trim() : '';
      const displayDate = rawDate ? formatDate(rawDate) : '';

      currentSection = null;
      currentRelease = {
        version,
        rawVersion,
        tag: version,
        date: rawDate,
        displayDate,
        sections: [],
      };
      releases.push(currentRelease);
      continue;
    }

    // Header description before any ## release
    if (inHeader) {
      headerDescLines.push(trimmed);
      continue;
    }

    if (!currentRelease) {
      continue;
    }

    // Subsection ### Features & Improvements
    if (line.startsWith('### ')) {
      const sectionTitle = line.replace(/^###\s+/, '').trim();
      currentSection = {
        title: sectionTitle,
        items: [],
        paragraphs: [],
      };
      currentRelease.sections.push(currentSection);
      continue;
    }

    // Bullet items - or *
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const item = parseItem(trimmed);
      if (!currentSection) {
        currentSection = {
          title: 'Changes',
          items: [],
        paragraphs: [],
        };
        currentRelease.sections.push(currentSection);
      }
      currentSection.items.push(item);
      continue;
    }

    if (currentSection && trimmed) {
      currentSection.paragraphs.push(trimmed);
      continue;
    }

    // If there is intro text before the first ### section
    if (!currentSection && trimmed) {
      if (currentRelease.intro) {
        currentRelease.intro += ' ' + trimmed;
      } else {
        currentRelease.intro = trimmed;
      }
    }
  }

  if (headerDescLines.length > 0) {
    description = headerDescLines.join(' ');
  }

  return {
    title,
    description,
    releases,
  };
}

function readIfPresent(file: string): string | null {
  try {
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
  } catch {
    // The Workers runtime has no filesystem, so callers fall back to the GitHub source.
    return null;
  }
}

function getLocalChangelog(): ChangelogData | null {
  const content =
    readIfPresent(path.join(process.cwd(), 'CHANGELOG.md')) ??
    readIfPresent(path.resolve(process.cwd(), '../CHANGELOG.md'));

  if (content?.trim()) {
    return parseChangelogContent(content);
  }

  return null;
}

export async function getChangelog(): Promise<ChangelogData> {
  const now = Date.now();
  if (cachedChangelog && now - cachedChangelogAt < CHANGELOG_TTL_MS) {
    return cachedChangelog;
  }

  // 1. Fetch from GitHub raw content
  try {
    const headers: HeadersInit = GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {};
    const res = await fetch(GITHUB_CHANGELOG_URL, {
      ...EDGE_CACHE_5_MIN,
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const markdown = await res.text();
      if (markdown.trim()) {
        const parsed = parseChangelogContent(markdown);
        cachedChangelog = parsed;
        cachedChangelogAt = Date.now();
        return parsed;
      }
    } else {
      console.warn(`[Changelog] GitHub fetch returned status ${res.status}, falling back to local file.`);
    }
  } catch (err) {
    console.warn('[Changelog] Failed to fetch from GitHub, falling back to local file:', err);
  }

  // 2. Fallback to local CHANGELOG.md
  const localParsed = getLocalChangelog();
  if (localParsed) {
    cachedChangelog = localParsed;
    cachedChangelogAt = Date.now();
    return localParsed;
  }

  if (cachedChangelog) {
    return cachedChangelog;
  }

  return {
    title: 'Changelog',
    description: 'All notable user-facing changes, feature additions, and improvements to OpenClip are documented here.',
    releases: [],
  };
}
