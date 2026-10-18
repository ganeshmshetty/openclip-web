import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, dirname } from 'path';

export interface DocHeading {
  id: string;
  title: string;
  level: 2 | 3;
}

export interface DocItemData {
  id: string;
  slug: string;
  title: string;
  category: string;
  categorySlug: string;
  description: string;
  order: number;
  sourcePath: string;
  headings: DocHeading[];
  rawMarkdown: string;
}

export interface DocCategoryData {
  id: string;
  name: string;
  description: string;
  icon: string;
  order: number;
  items: DocItemData[];
}

interface DocConfig {
  id: string;
  slug: string;
  categorySlug: string;
  categoryName: string;
  categoryDesc: string;
  categoryIcon: string;
  categoryOrder: number;
  order: number;
  filePath: string;
  overrideTitle?: string;
  overrideDescription?: string;
}

const DOCS_CONFIG: DocConfig[] = [
  // User Guide
  {
    id: 'getting-started',
    slug: 'getting-started',
    categorySlug: 'user-guide',
    categoryName: 'User Guide',
    categoryDesc: 'How to use OpenClip on macOS: Floating HUD, search palette, AI tools, and app rules.',
    categoryIcon: 'Compass',
    categoryOrder: 1,
    order: 1,
    filePath: 'docs/user-guide/installation.md',
    overrideTitle: 'Installation & Onboarding',
    overrideDescription: 'System requirements, installation steps, Accessibility permissions, and first-launch flow.',
  },
  {
    id: 'preferences',
    slug: 'preferences',
    categorySlug: 'user-guide',
    categoryName: 'User Guide',
    categoryDesc: 'How to use OpenClip on macOS: Floating HUD, search palette, AI tools, and app rules.',
    categoryIcon: 'Compass',
    categoryOrder: 1,
    order: 2,
    filePath: 'docs/user-guide/preferences.md',
    overrideTitle: 'Preferences & Customization',
    overrideDescription: 'Action ordering, custom titles and icons, popup theme styling, and AI provider setup.',
  },
  {
    id: 'app-rules',
    slug: 'app-rules',
    categorySlug: 'user-guide',
    categoryName: 'User Guide',
    categoryDesc: 'How to use OpenClip on macOS: Floating HUD, search palette, AI tools, and app rules.',
    categoryIcon: 'Compass',
    categoryOrder: 1,
    order: 3,
    filePath: 'docs/user-guide/app-rules.md',
    overrideTitle: 'Application-Specific Policy Rules',
    overrideDescription: 'Configure per-app retrieval modes, hotkey-only triggers, deny-paste downgrades, and pre-retrieval gates.',
  },
  {
    id: 'managing-extensions',
    slug: 'managing-extensions',
    categorySlug: 'user-guide',
    categoryName: 'User Guide',
    categoryDesc: 'How to use OpenClip on macOS: Floating HUD, search palette, AI tools, and app rules.',
    categoryIcon: 'Compass',
    categoryOrder: 1,
    order: 4,
    filePath: 'docs/user-guide/managing-extensions.md',
    overrideTitle: 'Managing Extensions & Store',
    overrideDescription: 'Extension store browser, remote one-click installation, and GUI custom action creation.',
  },

  // Extension Authoring
  {
    id: 'extension-overview',
    slug: 'extension-overview',
    categorySlug: 'extension-authoring',
    categoryName: 'Extension Authoring',
    categoryDesc: 'Create and package extensions using openclip.json, snippets, options, and rules.',
    categoryIcon: 'Code2',
    categoryOrder: 2,
    order: 1,
    filePath: 'docs/developer-guide/overview.md',
    overrideTitle: 'Extending OpenClip Overview',
    overrideDescription: 'High-level orientation for building custom actions, standalone snippets, and .openclipext packages.',
  },
  {
    id: 'manifest-spec',
    slug: 'manifest-spec',
    categorySlug: 'extension-authoring',
    categoryName: 'Extension Authoring',
    categoryDesc: 'Create and package extensions using openclip.json, snippets, options, and rules.',
    categoryIcon: 'Code2',
    categoryOrder: 2,
    order: 2,
    filePath: 'docs/developer-guide/AGENTS.md',
    overrideTitle: 'Extension Manifest Specification',
    overrideDescription: 'Authoritative schema and reference for openclip.json: all action kinds, options, requirements, and effects.',
  },
  {
    id: 'package-format',
    slug: 'package-format',
    categorySlug: 'extension-authoring',
    categoryName: 'Extension Authoring',
    categoryDesc: 'Create and package extensions using openclip.json, snippets, options, and rules.',
    categoryIcon: 'Code2',
    categoryOrder: 2,
    order: 3,
    filePath: 'docs/developer-guide/package-format.md',
    overrideTitle: 'Package Format & Directory Schema',
    overrideDescription: 'Structure of .openclipext packages, asset naming, options schema, and SecretStore integration.',
  },
  {
    id: 'snippets',
    slug: 'snippets',
    categorySlug: 'extension-authoring',
    categoryName: 'Extension Authoring',
    categoryDesc: 'Create and package extensions using openclip.json, snippets, options, and rules.',
    categoryIcon: 'Code2',
    categoryOrder: 2,
    order: 4,
    filePath: 'docs/developer-guide/snippets.md',
    overrideTitle: 'Standalone Script Snippets',
    overrideDescription: 'Single-file script actions with header comment metadata for Python, Shell, JavaScript, and AppleScript.',
  },
  {
    id: 'extensions-modules',
    slug: 'extensions-modules',
    categorySlug: 'extension-authoring',
    categoryName: 'Extension Authoring',
    categoryDesc: 'Create and package extensions using openclip.json, snippets, options, and rules.',
    categoryIcon: 'Code2',
    categoryOrder: 2,
    order: 5,
    filePath: 'docs/developer-guide/extensions-modules.md',
    overrideTitle: 'JavaScript Modules (CommonJS & npm)',
    overrideDescription: 'File-based JS actions with require() support, module caching, and bundling with esbuild.',
  },

  // Runtimes & APIs
  {
    id: 'javascript',
    slug: 'javascript',
    categorySlug: 'runtimes',
    categoryName: 'Runtimes & APIs',
    categoryDesc: 'JavaScriptCore bridge (openclip.*), AppleScript, zsh shell, keypress, and shortcuts.',
    categoryIcon: 'Cpu',
    categoryOrder: 3,
    order: 1,
    filePath: 'docs/runtimes/javascript.md',
    overrideTitle: 'JavaScript Runtime & Bridge',
    overrideDescription: 'Fast string manipulation, async fetch() polyfill, and the global openclip.* platform effect API.',
  },
  {
    id: 'applescript',
    slug: 'applescript',
    categorySlug: 'runtimes',
    categoryName: 'Runtimes & APIs',
    categoryDesc: 'JavaScriptCore bridge (openclip.*), AppleScript, zsh shell, keypress, and shortcuts.',
    categoryIcon: 'Cpu',
    categoryOrder: 3,
    order: 2,
    filePath: 'docs/runtimes/applescript.md',
    overrideTitle: 'AppleScript Runtime',
    overrideDescription: 'macOS app automation for Notes, Mail, Safari, and Finder via NSAppleScript and osascript.',
  },
  {
    id: 'url-templates',
    slug: 'url-templates',
    categorySlug: 'runtimes',
    categoryName: 'Runtimes & APIs',
    categoryDesc: 'JavaScriptCore bridge (openclip.*), AppleScript, zsh shell, keypress, and shortcuts.',
    categoryIcon: 'Cpu',
    categoryOrder: 3,
    order: 3,
    filePath: 'docs/runtimes/url-templates.md',
    overrideTitle: 'URL Templates Engine',
    overrideDescription: 'Web searches, documentation lookups, and deep links with percent-encoded placeholder tokens.',
  },
  {
    id: 'zsh-python',
    slug: 'zsh-python',
    categorySlug: 'runtimes',
    categoryName: 'Runtimes & APIs',
    categoryDesc: 'JavaScriptCore bridge (openclip.*), AppleScript, zsh shell, keypress, and shortcuts.',
    categoryIcon: 'Cpu',
    categoryOrder: 3,
    order: 4,
    filePath: 'docs/runtimes/zsh-python.md',
    overrideTitle: 'Shell & Python Scripts',
    overrideDescription: 'Subprocess execution with 30-second watchdog, environment variable inputs, and structured JSON outputs.',
  },
  {
    id: 'integration-api',
    slug: 'integration-api',
    categorySlug: 'runtimes',
    categoryName: 'Runtimes & APIs',
    categoryDesc: 'JavaScriptCore bridge (openclip.*), AppleScript, zsh shell, keypress, and shortcuts.',
    categoryIcon: 'Cpu',
    categoryOrder: 3,
    order: 5,
    filePath: 'docs/developer-guide/integration-api.md',
    overrideTitle: 'Integration & Automation API',
    overrideDescription: 'The inbound openclip:// contract: routes, curated settings, callbacks, and what is not yet exposed.',
  },

  // Architecture & Internals
  {
    id: 'architecture-overview',
    slug: 'architecture-overview',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 1,
    filePath: 'docs/architecture/overview.md',
    overrideTitle: 'Architecture Overview & Boundaries',
    overrideDescription: 'Target split between pure Core domain framework and OpenClip macOS platform integration.',
  },
  {
    id: 'action-coordinator',
    slug: 'action-coordinator',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 2,
    filePath: 'docs/architecture/action-coordinator.md',
    overrideTitle: 'Action Coordinator & Composition',
    overrideDescription: 'The composition root orchestrating extension loaders, builtins, and the central action registry.',
  },
  {
    id: 'popup-window',
    slug: 'popup-window',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 3,
    filePath: 'docs/architecture/popup-window.md',
    overrideTitle: 'Popup Window & Presentation',
    overrideDescription: 'Floating panel lifecycle, screen clamping math, mode transitions, and status toasts.',
  },
  {
    id: 'text-selection',
    slug: 'text-selection',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 4,
    filePath: 'docs/architecture/text-selection.md',
    overrideTitle: 'Text Selection & Strategy Chain',
    overrideDescription: 'Multi-strategy selection extraction using Accessibility APIs, WebKit markers, and AppleScript.',
  },
  {
    id: 'extensions-architecture',
    slug: 'extensions-architecture',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 5,
    filePath: 'docs/architecture/extensions.md',
    overrideTitle: 'Extension Trust Model & Tiers',
    overrideDescription: 'Security boundaries, manifest validation passes, capability gates, and runtime privilege tiers.',
  },
  {
    id: 'logging',
    slug: 'logging',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 6,
    filePath: 'docs/logging.md',
    overrideTitle: 'Dual-Sink Logging Architecture',
    overrideDescription: 'High-performance in-memory ring buffer, Apple os.Logger, rotating log file appender, and CLI dump.',
  },
  {
    id: 'directory-structure',
    slug: 'directory-structure',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 7,
    filePath: 'docs/architecture/directory-structure.md',
    overrideTitle: 'Source Directory Structure',
    overrideDescription: 'Detailed map of all Core and OpenClip source files, components, and responsibilities.',
  },
  {
    id: 'known-debt',
    slug: 'known-debt',
    categorySlug: 'architecture',
    categoryName: 'Architecture & Internals',
    categoryDesc: 'How OpenClip is engineered: Selection cascade, ActionCoordinator, and dual-sink logging.',
    categoryIcon: 'Layers',
    categoryOrder: 4,
    order: 8,
    filePath: 'docs/architecture/known-debt.md',
    overrideTitle: 'Architecture Status & Debt',
    overrideDescription: 'Verified current state, completed refactors, and tracked architectural improvements.',
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  const lines = markdown.split('\n');
  const seenIds = new Set<string>();

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)$/);
    const h3Match = line.match(/^###\s+(.+)$/);

    if (h2Match) {
      const title = h2Match[1].replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      let id = slugify(title);
      if (seenIds.has(id)) {
        let count = 2;
        while (seenIds.has(`${id}-${count}`)) count++;
        id = `${id}-${count}`;
      }
      seenIds.add(id);
      headings.push({ id, title, level: 2 });
    } else if (h3Match) {
      const title = h3Match[1].replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
      let id = slugify(title);
      if (seenIds.has(id)) {
        let count = 2;
        while (seenIds.has(`${id}-${count}`)) count++;
        id = `${id}-${count}`;
      }
      seenIds.add(id);
      headings.push({ id, title, level: 3 });
    }
  }

  return headings;
}

function extractTitleAndDescription(markdown: string, fallbackTitle: string, fallbackDesc: string): { title: string; description: string } {
  const lines = markdown.split('\n');
  let title = fallbackTitle;
  let description = fallbackDesc;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ') && !title) {
      title = line.substring(2).replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
    } else if (line && !line.startsWith('#') && !line.startsWith('>') && !line.startsWith('```') && !line.startsWith('-') && !line.startsWith('|')) {
      if (!description || description === fallbackDesc) {
        description = line.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
        if (description.length > 220) {
          description = description.substring(0, 217) + '...';
        }
      }
    }
  }

  return { title, description };
}

export function syncDocs() {
  const repoRoot = resolve(__dirname, '../../');
  const webRoot = resolve(__dirname, '../');
  const outputDir = join(webRoot, 'src/docs/data');
  const outputFile = join(outputDir, 'docsData.json');
  const webContentDocs = join(webRoot, 'content/docs');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  if (!existsSync(webContentDocs)) {
    mkdirSync(webContentDocs, { recursive: true });
  }

  // Load existing docsData.json if it exists to preserve markdown across headless/Vercel builds
  const existingDocsMap = new Map<string, DocItemData>();
  if (existsSync(outputFile)) {
    try {
      const existingJson = JSON.parse(readFileSync(outputFile, 'utf-8'));
      if (Array.isArray(existingJson.allDocs)) {
        for (const doc of existingJson.allDocs) {
          if (doc.rawMarkdown && doc.rawMarkdown.trim().length > 0) {
            existingDocsMap.set(doc.id, doc);
          }
        }
      }
    } catch {}
  }

  console.log('[Docs Sync] Loading markdown documents from repository...');

  const categoriesMap = new Map<string, DocCategoryData>();

  for (const config of DOCS_CONFIG) {
    const repoPath = join(repoRoot, config.filePath);
    const agentsPath = join(repoRoot, 'Extensions/AGENTS.md');
    const webSubPath = config.filePath.replace(/^docs\//, '');
    const webPath = join(webContentDocs, webSubPath);

    let markdown = '';

    if (existsSync(repoPath)) {
      markdown = readFileSync(repoPath, 'utf-8');
      try {
        const destDir = dirname(webPath);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        writeFileSync(webPath, markdown, 'utf-8');
      } catch {}
    } else if (config.filePath === 'docs/developer-guide/AGENTS.md' && existsSync(agentsPath)) {
      markdown = readFileSync(agentsPath, 'utf-8');
      try {
        const destDir = dirname(webPath);
        if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        writeFileSync(webPath, markdown, 'utf-8');
      } catch {}
    } else if (existsSync(webPath)) {
      markdown = readFileSync(webPath, 'utf-8');
    } else if (existingDocsMap.has(config.id)) {
      console.log(`[Docs Sync] ℹ Using cached markdown for ${config.id}`);
      markdown = existingDocsMap.get(config.id)!.rawMarkdown;
    } else {
      console.warn(`[Docs Sync] ⚠ File not found locally: ${config.filePath}.`);
    }

    const { title: parsedTitle, description: parsedDesc } = extractTitleAndDescription(
      markdown,
      config.overrideTitle || config.id,
      config.overrideDescription || ''
    );

    const title = config.overrideTitle || parsedTitle;
    const description = config.overrideDescription || parsedDesc;
    const headings = extractHeadings(markdown);

    const itemData: DocItemData = {
      id: config.id,
      slug: config.slug,
      title,
      category: config.categoryName,
      categorySlug: config.categorySlug,
      description,
      order: config.order,
      sourcePath: config.filePath,
      headings,
      rawMarkdown: markdown,
    };

    if (!categoriesMap.has(config.categorySlug)) {
      categoriesMap.set(config.categorySlug, {
        id: config.categorySlug,
        name: config.categoryName,
        description: config.categoryDesc,
        icon: config.categoryIcon,
        order: config.categoryOrder,
        items: [],
      });
    }

    categoriesMap.get(config.categorySlug)!.items.push(itemData);
  }

  // Sort categories and items
  const categories = Array.from(categoriesMap.values()).sort((a, b) => a.order - b.order);
  for (const cat of categories) {
    cat.items.sort((a, b) => a.order - b.order);
  }

  const allDocs = categories.flatMap((c) => c.items);

  const payload = {
    generatedAt: new Date().toISOString(),
    categories,
    allDocs,
  };

  writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[Docs Sync] ✓ Successfully synchronized ${allDocs.length} markdown documents to ${outputFile}`);

  // Generate public/agent-prompt.txt for 1-click Agent Prompt copy
  const publicDir = join(webRoot, 'public');
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }
  const agentPromptFile = join(publicDir, 'agent-prompt.txt');
  let specMarkdown = '';
  const manifestDoc = allDocs.find((d) => d.id === 'manifest-spec');
  if (manifestDoc && manifestDoc.rawMarkdown) {
    specMarkdown = manifestDoc.rawMarkdown;
  } else {
    const agentsPath = join(webContentDocs, 'developer-guide/AGENTS.md');
    if (existsSync(agentsPath)) {
      specMarkdown = readFileSync(agentsPath, 'utf-8');
    }
  }

  if (specMarkdown) {
    const promptHeader = `# Instructions for AI Agent: Authoring OpenClip Extensions

You are an expert developer assistant specialized in creating extensions for OpenClip.
OpenClip is a native macOS floating-popup utility (Swift 6, macOS 14+, AppKit + SwiftUI) that turns selected text into instant actions.

## Context & Objectives
When asked to author or modify an OpenClip extension, you will generate or update a complete extension package:
1. \`openclip.json\` (the extension manifest file specifying actions, options, triggers, and effects).
2. Accompanying executable scripts (\`run.js\`, \`script.sh\`, \`script.py\`, \`run.applescript\`, etc.) if needed.
3. Proper permissions, icons, and localized labels.

## Authoritative Specification
Adhere strictly to the OpenClip Extension Manifest Specification below. Do NOT hallucinate keys, enum values, or effect types.

---

`;
    writeFileSync(agentPromptFile, promptHeader + specMarkdown, 'utf-8');
    console.log(`[Docs Sync] ✓ Successfully generated Agent Prompt static asset at ${agentPromptFile}`);
  }
}

// Run immediately when executed as script
syncDocs();

