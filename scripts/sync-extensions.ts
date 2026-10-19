import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';

export interface SyncedOption {
  identifier: string;
  label?: string;
  type?: string;
  default?: any;
  values?: string[];
  description?: string;
}

export interface SyncedSubAction {
  id?: string;
  title: string;
  type: string;
  icon?: string;
  description?: string;
}

export interface SyncedExtensionData {
  id: string;
  pkgName: string;
  name: string;
  description: string;
  author: string;
  version: string;
  minOpenClipVersion: string;
  actionType: string;
  sourceURL: string;
  hasAuthoredReadme: boolean;
  readmeMarkdown: string;
  options: SyncedOption[];
  requirements?: {
    regex?: string;
    regexNegated?: boolean;
    minLength?: number;
    maxLength?: number;
  };
  keywords: string[];
  subActions: SyncedSubAction[];
}

function resolveText(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'object') {
    if (typeof val.en === 'string' && val.en.trim()) return val.en.trim();
    for (const k of Object.keys(val)) {
      if (typeof val[k] === 'string' && val[k].trim()) return val[k].trim();
    }
  }
  return '';
}

function determineActionType(manifest: any): string {
  const action = manifest.action;
  const actions = manifest.actions;

  if (action?.type) {
    switch (action.type.toLowerCase()) {
      case 'javascript':
        return 'JavaScript';
      case 'shell':
        return 'Shell Script';
      case 'applescript':
        return 'AppleScript';
      case 'url':
        return 'URL Template';
      case 'keypress':
        return 'Keypress Simulation';
      case 'shortcut':
        return 'macOS Shortcut';
      case 'group':
        return 'Action Group';
      case 'service':
        return 'macOS Service';
      default:
        return action.type.charAt(0).toUpperCase() + action.type.slice(1);
    }
  }

  if (action?.url) return 'URL Template';
  if (typeof action?.script === 'string') {
    if (action.script.endsWith('.js')) return 'JavaScript';
    if (action.script.endsWith('.sh') || action.script.endsWith('.zsh')) return 'Shell Script';
    if (action.script.endsWith('.applescript') || action.script.endsWith('.scpt')) return 'AppleScript';
    if (action.script.endsWith('.py')) return 'Python Script';
  }
  if (actions && Array.isArray(actions)) return 'Action Group';
  if (action?.keyCodes || action?.keyEquivalent) return 'Keypress Simulation';

  return 'Native Action';
}

function synthesizeReadme(data: {
  name: string;
  description: string;
  author: string;
  version: string;
  minOpenClipVersion: string;
  actionType: string;
  options: SyncedOption[];
  requirements?: any;
  subActions: SyncedSubAction[];
  keywords: string[];
}): string {
  const lines: string[] = [];

  // Title and Description
  lines.push(`# ${data.name}`);
  lines.push('');
  if (data.description) {
    lines.push(data.description);
    lines.push('');
  }

  // Overview
  lines.push('## Overview');
  lines.push('');
  lines.push(`- **Action Engine**: ${data.actionType}`);
  lines.push(`- **Author**: ${data.author}`);
  lines.push(`- **Version**: v${data.version}`);
  lines.push(`- **Minimum OpenClip Version**: v${data.minOpenClipVersion || '1.0.0'}`);
  lines.push('- **Platform Compatibility**: macOS 14+ (Sonoma & Sequoia)');
  lines.push('');

  // Sub-Actions (if Action Group)
  if (data.subActions && data.subActions.length > 0) {
    lines.push('## Included Sub-Actions');
    lines.push('');
    lines.push('This action group includes multiple quick tools you can invoke individually:');
    lines.push('');
    for (const sub of data.subActions) {
      const typeLabel = sub.type ? ` (${sub.type})` : '';
      lines.push(`- **${sub.title}**${typeLabel}`);
    }
    lines.push('');
  }

  // Configuration Options
  if (data.options && data.options.length > 0) {
    lines.push('## Configuration Options');
    lines.push('');
    lines.push('You can customize this extension in OpenClip Settings (⌘,) › Extensions:');
    lines.push('');
    lines.push('| Setting | Key | Type | Default | Choices / Details |');
    lines.push('| :--- | :--- | :--- | :--- | :--- |');

    for (const opt of data.options) {
      const label = opt.label || opt.identifier;
      const key = `\`${opt.identifier}\``;
      const optType = opt.type || 'string';
      const defaultVal = opt.default !== undefined ? `\`${String(opt.default)}\`` : '*(none)*';
      let details = opt.description || '';
      if (opt.values && Array.isArray(opt.values) && opt.values.length > 0) {
        if (opt.values.length <= 6) {
          details = opt.values.map((v) => `\`${v}\``).join(', ');
        } else {
          details = `${opt.values.slice(0, 5).map((v) => `\`${v}\``).join(', ')} (+${opt.values.length - 5} more)`;
        }
      }
      lines.push(`| **${label}** | ${key} | ${optType} | ${defaultVal} | ${details || '—'} |`);
    }
    lines.push('');
  }

  // Trigger Requirements
  if (data.requirements) {
    const reqs: string[] = [];
    if (data.requirements.regex) {
      reqs.push(`- **Pattern Match**: Text must ${data.requirements.regexNegated ? 'not ' : ''}match regex: \`${data.requirements.regex}\``);
    }
    if (typeof data.requirements.minLength === 'number') {
      reqs.push(`- **Minimum Length**: ${data.requirements.minLength} characters`);
    }
    if (typeof data.requirements.maxLength === 'number') {
      reqs.push(`- **Maximum Length**: ${data.requirements.maxLength} characters`);
    }

    if (reqs.length > 0) {
      lines.push('## Activation Filters');
      lines.push('');
      lines.push('OpenClip only displays this action when the selected text satisfies these conditions:');
      lines.push('');
      lines.push(reqs.join('\n'));
      lines.push('');
    }
  }

  // How to Use
  lines.push('## How to Use');
  lines.push('');
  lines.push(`1. Select text in any macOS application (Safari, Notes, Messages, Terminal, Xcode, etc.).`);
  lines.push(`2. Click the **${data.name}** button in the floating OpenClip popup bar, or press your global command palette shortcut (\`⌥⌘C\`).`);
  lines.push(`3. OpenClip executes the action instantly in the background with zero background memory bloat.`);
  lines.push('');

  return lines.join('\n');
}

export function syncExtensions() {
  const repoRoot = resolve(__dirname, '../../');
  const webRoot = resolve(__dirname, '../');
  const extensionsRawDir = join(repoRoot, 'Extensions/raw');
  const outputDir = join(webRoot, 'src/docs/data');
  const outputFile = join(outputDir, 'extensionsData.json');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Fallback cache if Extensions/raw is not present (e.g. headless Vercel deploy without submodule)
  let existingMap = new Map<string, SyncedExtensionData>();
  if (existsSync(outputFile)) {
    try {
      const existingData = JSON.parse(readFileSync(outputFile, 'utf-8'));
      if (existingData.extensions && typeof existingData.extensions === 'object') {
        for (const [key, val] of Object.entries(existingData.extensions)) {
          existingMap.set(key.toLowerCase(), val as SyncedExtensionData);
        }
      }
    } catch {}
  }

  const results: Record<string, SyncedExtensionData> = {};

  if (!existsSync(extensionsRawDir)) {
    console.warn(`[Extensions Sync] ⚠ Extensions/raw directory not found at ${extensionsRawDir}. Using cached data.`);
    if (existingMap.size > 0) {
      for (const [k, v] of existingMap) {
        results[k] = v;
      }
      return;
    }
  } else {
    console.log('[Extensions Sync] Scanning extensions from Extensions/raw...');
    const entries = readdirSync(extensionsRawDir);

    const catalogPath = join(repoRoot, 'Extensions/published/catalog.json');
    const publishedIds = new Set<string>();
    if (existsSync(catalogPath)) {
      try {
        const cat = JSON.parse(readFileSync(catalogPath, 'utf-8'));
        if (Array.isArray(cat.extensions)) {
          for (const item of cat.extensions) {
            if (item.id) publishedIds.add(String(item.id).toLowerCase());
          }
        }
      } catch {}
    }

    for (const dirName of entries) {
      const dirPath = join(extensionsRawDir, dirName);
      if (!statSync(dirPath).isDirectory()) continue;

      const manifestPath = join(dirPath, 'openclip.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifestRaw = readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestRaw);

        let identifier = manifest.identifier;
        if (!identifier) {
          identifier = `com.openclip.${dirName.replace(/\.openclipext$/, '').toLowerCase()}`;
        }

        if (publishedIds.size > 0 && !publishedIds.has(identifier.toLowerCase())) {
          continue;
        }

        const name =
          resolveText(manifest.name) ||
          resolveText(manifest.action?.title) ||
          resolveText(manifest.actions?.[0]?.title) ||
          dirName.replace(/\.openclipext$/, '');

        const description = resolveText(manifest.description);
        const author = manifest.author || 'OpenClip Team';
        const version = manifest.version || '1.0.0';
        const minOpenClipVersion = manifest.minOpenClipVersion || '1.0.0';
        const keywords = Array.isArray(manifest.keywords) ? manifest.keywords : [];
        const options: SyncedOption[] = Array.isArray(manifest.options)
          ? manifest.options.map((o: any) => ({
              identifier: o.identifier,
              label: resolveText(o.label) || o.identifier,
              type: o.type || 'string',
              default: o.default,
              values: Array.isArray(o.values) ? o.values : undefined,
              description: resolveText(o.description),
            }))
          : [];

        const actionType = determineActionType(manifest);

        // Sub-actions
        const subActions: SyncedSubAction[] = [];
        if (manifest.action?.type === 'group' && Array.isArray(manifest.action.subActions)) {
          for (const sa of manifest.action.subActions) {
            subActions.push({
              id: sa.id,
              title: resolveText(sa.title) || sa.id || 'Action',
              type: sa.type || 'shell',
              icon: sa.icon,
            });
          }
        } else if (Array.isArray(manifest.actions)) {
          for (const sa of manifest.actions) {
            subActions.push({
              id: sa.identifier || sa.id,
              title: resolveText(sa.title) || sa.identifier || 'Action',
              type: sa.type || 'action',
              icon: sa.icon,
            });
          }
        }

        const requirements = manifest.requirements || manifest.action?.requirements;

        const readmePath = join(dirPath, 'README.md');
        let hasAuthoredReadme = false;
        let readmeMarkdown = '';

        if (existsSync(readmePath)) {
          const content = readFileSync(readmePath, 'utf-8').trim();
          if (content.length > 0) {
            hasAuthoredReadme = true;
            readmeMarkdown = content;
          }
        }

        if (!readmeMarkdown) {
          readmeMarkdown = synthesizeReadme({
            name,
            description,
            author,
            version,
            minOpenClipVersion,
            actionType,
            options,
            requirements,
            subActions,
            keywords,
          });
        }

        const sourceURL = `https://github.com/ganeshmshetty/openclip-extensions/tree/main/raw/${dirName}`;

        const data: SyncedExtensionData = {
          id: identifier,
          pkgName: dirName,
          name,
          description,
          author,
          version,
          minOpenClipVersion,
          actionType,
          sourceURL,
          hasAuthoredReadme,
          readmeMarkdown,
          options,
          requirements,
          keywords,
          subActions,
        };

        results[identifier.toLowerCase()] = data;
        results[identifier] = data;
      } catch (err) {
        console.error(`[Extensions Sync] Error processing ${dirName}:`, err);
      }
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    count: Object.keys(results).length,
    // Icons actually copied into public/icons/extensions. The live catalog can be
    // newer than the local extensions clone, so this tells the store which icons it
    // can serve statically and which need the same-origin proxy.
    icons: listPublishedIcons(repoRoot),
    extensions: results,
  };

  writeFileSync(outputFile, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`[Extensions Sync] ✓ Successfully synchronized ${Object.keys(results).length} extensions to ${outputFile}`);

  copyPublishedIcons(repoRoot, webRoot);
}

/**
 * Copies the published monochrome icons into `public/` so the store serves them
 * from its own origin. They used to be fetched by the browser from
 * cdn.jsdelivr.net — 130+ third-party requests on every store visit.
 *
 * Vercel builds have no `Extensions/` clone, so the committed copies are what
 * ships there; the early return keeps them intact.
 */
/**
 * Ids with a local icon file, lower-cased. Empty when the extensions clone is absent
 * (Vercel), where the committed `public/icons/extensions` copies are used instead.
 */
function listPublishedIcons(repoRoot: string): string[] {
  const dir = join(repoRoot, 'Extensions/published/icons');
  const targetDir = join(repoRoot, 'web/public/icons/extensions');
  const source = existsSync(dir) ? dir : targetDir;
  if (!existsSync(source)) return [];
  return readdirSync(source)
    .filter((file) => file.endsWith('.svg'))
    .map((file) => file.slice(0, -4).toLowerCase());
}

function copyPublishedIcons(repoRoot: string, webRoot: string) {
  const sourceDir = join(repoRoot, 'Extensions/published/icons');
  const targetDir = join(webRoot, 'public/icons/extensions');

  if (!existsSync(sourceDir)) {
    console.log('[Extensions Sync] · No local icons source; keeping committed copies in public/icons/extensions.');
    return;
  }

  mkdirSync(targetDir, { recursive: true });

  const sourceFiles = readdirSync(sourceDir).filter((file) => file.endsWith('.svg'));
  for (const file of sourceFiles) {
    copyFileSync(join(sourceDir, file), join(targetDir, file));
  }

  const keep = new Set(sourceFiles);
  let removed = 0;
  for (const file of readdirSync(targetDir)) {
    if (file.endsWith('.svg') && !keep.has(file)) {
      rmSync(join(targetDir, file), { force: true });
      removed += 1;
    }
  }

  console.log(
    `[Extensions Sync] ✓ Copied ${sourceFiles.length} icons to public/icons/extensions` +
      (removed ? ` (pruned ${removed} stale)` : '')
  );
}

syncExtensions();
