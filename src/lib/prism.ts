import Prism from 'prismjs';

// Ensure Prism is globally available so language definitions can register themselves
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { Prism: typeof Prism }).Prism = Prism;
}

// Load syntax grammars
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-applescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-swift';

const LANGUAGE_ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  js: 'javascript',
  ts: 'typescript',
  jsonc: 'json',
  py: 'python',
  yml: 'yaml',
  md: 'markdown',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function highlightCode(code: string, language: string = 'text'): string {
  if (!code) return '';
  const trimmed = code.trim();
  const rawLang = language.toLowerCase().trim();
  const langKey = LANGUAGE_ALIASES[rawLang] || rawLang;
  const grammar = Prism.languages[langKey];

  if (grammar) {
    try {
      return Prism.highlight(trimmed, grammar, langKey);
    } catch {
      // Fallback to escaping if Prism fails
    }
  }

  return escapeHtml(trimmed);
}
