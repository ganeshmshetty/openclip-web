'use client';

import React from 'react';
import { marked, Tokens, Token } from 'marked';
import { CodeBlock, Callout, DocTable, InlineCode } from './DocComponents';
import { MermaidDiagram } from './MermaidDiagram';
import Link from 'next/link';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const DOC_LINK_MAP: Record<string, string> = {
  'installation.md': '/docs/getting-started',
  'preferences.md': '/docs/preferences',
  'app-rules.md': '/docs/app-rules',
  'managing-extensions.md': '/docs/managing-extensions',
  'agents.md': '/docs/manifest-spec',
  'package-format.md': '/docs/package-format',
  'snippets.md': '/docs/snippets',
  'extensions-modules.md': '/docs/extensions-modules',
  'javascript.md': '/docs/javascript',
  'applescript.md': '/docs/applescript',
  'url-templates.md': '/docs/url-templates',
  'zsh-python.md': '/docs/zsh-python',
  'action-coordinator.md': '/docs/action-coordinator',
  'popup-window.md': '/docs/popup-window',
  'text-selection.md': '/docs/text-selection',
  'logging.md': '/docs/logging',
  'directory-structure.md': '/docs/directory-structure',
  'known-debt.md': '/docs/known-debt',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/// Plain text of a heading, with inline `code` and [links](…) unwrapped so the
/// anchor id matches what scripts/sync-docs.ts computes for the TOC.
function headingText(token: Tokens.Heading): string {
  return token.text.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
}

function rewriteLink(href: string): { href: string; isExternal: boolean } {
  if (!href) return { href: '#', isExternal: false };

  // Absolute Web URL
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return { href, isExternal: true };
  }

  // Anchor in page
  if (href.startsWith('#')) {
    return { href, isExternal: false };
  }

  // Relative code link: ../../Sources/... -> GitHub URL
  if (href.includes('Sources/')) {
    const cleanPath = href.substring(href.indexOf('Sources/'));
    return {
      href: `https://github.com/ganeshmshetty/openclip/blob/main/${cleanPath}`,
      isExternal: true,
    };
  }

  // Split link and anchor hash
  const [basePath, hash] = href.split('#');
  const filename = basePath.split('/').pop()?.toLowerCase() || '';

  // Handle overview.md collision
  if (filename === 'overview.md') {
    if (basePath.includes('architecture')) {
      return { href: `/docs/architecture-overview${hash ? `#${hash}` : ''}`, isExternal: false };
    }
    return { href: `/docs/extension-overview${hash ? `#${hash}` : ''}`, isExternal: false };
  }

  // Handle extensions.md collision
  if (filename === 'extensions.md') {
    return { href: `/docs/extensions-architecture${hash ? `#${hash}` : ''}`, isExternal: false };
  }

  if (DOC_LINK_MAP[filename]) {
    return { href: `${DOC_LINK_MAP[filename]}${hash ? `#${hash}` : ''}`, isExternal: false };
  }

  return { href, isExternal: false };
}

function renderInlineTokens(tokens?: Token[]): React.ReactNode {
  if (!tokens || tokens.length === 0) return null;

  return tokens.map((token, index) => {
    switch (token.type) {
      case 'text': {
        // If the text token has nested tokens (such as strong, em, codespan inside list items), recurse!
        if ('tokens' in token && token.tokens && token.tokens.length > 0) {
          return <React.Fragment key={index}>{renderInlineTokens(token.tokens)}</React.Fragment>;
        }
        const text = token.text;
        if (text.includes('<kbd>') && text.includes('</kbd>')) {
          const parts = text.split(/(<kbd>.*?<\/kbd>)/g);
          return (
            <React.Fragment key={index}>
              {parts.map((part: string, pIdx: number) => {
                const kbdMatch = part.match(/<kbd>(.*?)<\/kbd>/);
                if (kbdMatch) {
                  return (
                    <kbd
                      key={pIdx}
                      className="px-1.5 py-0.5 mx-0.5 rounded bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-[11.5px] text-[var(--text-primary)] shadow-xs font-semibold inline-block"
                    >
                      {kbdMatch[1]}
                    </kbd>
                  );
                }
                return part;
              })}
            </React.Fragment>
          );
        }
        return <React.Fragment key={index}>{text}</React.Fragment>;
      }

      case 'paragraph': {
        if ('tokens' in token && token.tokens && token.tokens.length > 0) {
          return <React.Fragment key={index}>{renderInlineTokens(token.tokens)}</React.Fragment>;
        }
        return <React.Fragment key={index}>{token.text}</React.Fragment>;
      }

      case 'strong':
        return (
          <strong key={index} className="font-semibold text-[var(--text-primary)]">
            {token.tokens ? renderInlineTokens(token.tokens) : token.text}
          </strong>
        );

      case 'em':
        return (
          <em key={index} className="italic text-[var(--text-primary)]">
            {token.tokens ? renderInlineTokens(token.tokens) : token.text}
          </em>
        );

      case 'codespan':
        return <InlineCode key={index}>{token.text}</InlineCode>;

      case 'link': {
        const { href, isExternal } = rewriteLink(token.href);
        if (isExternal) {
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline font-medium inline-flex items-baseline gap-0.5"
            >
              {renderInlineTokens(token.tokens)}
            </a>
          );
        }
        return (
          <Link
            key={index}
            href={href}
            className="text-[var(--accent)] hover:underline font-medium"
          >
            {renderInlineTokens(token.tokens)}
          </Link>
        );
      }

      case 'del':
        return <del key={index} className="line-through opacity-70">{renderInlineTokens(token.tokens)}</del>;

      case 'br':
        return <br key={index} />;

      case 'image': {
        const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(token.href);
        if (isVideo) {
          return (
            <video
              key={index}
              src={token.href}
              title={token.title || token.text}
              autoPlay
              loop
              muted
              playsInline
              controls
              className="rounded-2xl border border-[var(--border-subtle)] my-5 max-w-full w-full h-auto shadow-sm aspect-video object-cover bg-black/5"
            />
          );
        }
        return (
          <img
            key={index}
            src={token.href}
            alt={token.title || token.text}
            className="rounded-xl border border-[var(--border-subtle)] my-4 max-w-full h-auto"
          />
        );
      }

      case 'escape':
        return <React.Fragment key={index}>{token.text}</React.Fragment>;

      default:
        return (
          <React.Fragment key={index}>
            {'text' in token ? (token as Tokens.Text).text : ''}
          </React.Fragment>
        );
    }
  });
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const tokens = React.useMemo(() => {
    return marked.lexer(content, { gfm: true, breaks: false });
  }, [content]);

  // Strip initial H1 if present (it is already rendered by DocPage header)
  const displayTokens = React.useMemo(() => {
    if (tokens.length > 0 && tokens[0].type === 'heading' && (tokens[0] as Tokens.Heading).depth === 1) {
      return tokens.slice(1);
    }
    return tokens;
  }, [tokens]);

  // Heading ids must match scripts/sync-docs.ts (same slugify plus duplicate
  // suffixing) so the "On this page" TOC anchors land on the right heading.
  const headingIds = React.useMemo(() => {
    const seen = new Set<string>();
    const map = new Map<Token, string>();

    for (const token of displayTokens) {
      if (token.type !== 'heading') continue;

      let id = slugify(headingText(token as Tokens.Heading));
      if (seen.has(id)) {
        let count = 2;
        while (seen.has(`${id}-${count}`)) count++;
        id = `${id}-${count}`;
      }
      seen.add(id);
      map.set(token, id);
    }

    return map;
  }, [displayTokens]);

  const renderHeading = (token: Tokens.Heading, key: string) => {
    const text = headingText(token);
    const id = headingIds.get(token) ?? slugify(text);

    if (token.depth === 2) {
      return (
        <h2
          key={key}
          id={id}
          className="text-[22px] sm:text-[24px] font-bold text-[var(--text-primary)] tracking-tight pt-5 pb-2 scroll-mt-24 group flex items-center gap-2 border-b border-[var(--border-subtle)]/70"
        >
          <span>{renderInlineTokens(token.tokens)}</span>
          <a
            href={`#${id}`}
            className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--accent)] text-[14px] transition-opacity"
            aria-label={`Link to ${text}`}
          >
            #
          </a>
        </h2>
      );
    }

    if (token.depth === 3) {
      return (
        <h3
          key={key}
          id={id}
          className="text-[17px] sm:text-[18px] font-semibold text-[var(--text-primary)] tracking-tight pt-5 pb-1 scroll-mt-24 group flex items-center gap-2"
        >
          <span>{renderInlineTokens(token.tokens)}</span>
          <a
            href={`#${id}`}
            className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-[var(--accent)] text-[13px] transition-opacity"
            aria-label={`Link to ${text}`}
          >
            #
          </a>
        </h3>
      );
    }

    return (
      <h4
        key={key}
        id={id}
        className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight pt-3 scroll-mt-24"
      >
        {renderInlineTokens(token.tokens)}
      </h4>
    );
  };

  const renderBlockquote = (token: Tokens.Blockquote, key: string) => {
    // Check for GitHub Alerts: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
    const rawText = token.text.trim();
    const alertMatch = rawText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);

    if (alertMatch) {
      const alertType = alertMatch[1].toUpperCase();
      let type: 'info' | 'tip' | 'warning' | 'security' = 'info';
      let title = 'Note';

      if (alertType === 'NOTE') {
        type = 'info';
        title = 'Note';
      } else if (alertType === 'TIP') {
        type = 'tip';
        title = 'Tip';
      } else if (alertType === 'IMPORTANT') {
        type = 'warning';
        title = 'Important';
      } else if (alertType === 'WARNING') {
        type = 'warning';
        title = 'Warning';
      } else if (alertType === 'CAUTION') {
        type = 'security';
        title = 'Caution';
      }

      // Remove the [!NOTE] tag and render the remaining blocks (paragraphs, lists, code).
      const cleanRaw = rawText.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/i, '');
      const innerTokens = marked.lexer(cleanRaw, { gfm: true });

      return (
        <Callout key={key} type={type} title={title}>
          <div className="space-y-2">{renderBlocks(innerTokens, `${key}-alert`)}</div>
        </Callout>
      );
    }

    return (
      <blockquote
        key={key}
        className="border-l-2 border-[var(--accent)] bg-[var(--bg-tertiary)]/40 px-4 py-3 rounded-r-xl my-4 text-[14px] italic text-[var(--text-primary)] space-y-2"
      >
        {renderBlocks(token.tokens ?? [], `${key}-quote`)}
      </blockquote>
    );
  };

  const renderTable = (token: Tokens.Table, key: string) => {
    const headers = (token.header as Tokens.TableCell[]).map((h) => h.text);
    const rows = (token.rows as Tokens.TableCell[][]).map((row) =>
      row.map((cell) => renderInlineTokens(cell.tokens))
    );

    return <DocTable key={key} headers={headers} rows={rows} />;
  };

  const renderList = (token: Tokens.List, key: string) => {
    const items = token.items as Tokens.ListItem[];

    const children = items.map((item, iIdx) => {
      // Render each item's tokens as blocks so nested lists, code fences,
      // tables and blockquotes survive instead of being flattened away.
      const content = renderBlocks(item.tokens ?? [], `${key}-item-${iIdx}`);

      if (item.task) {
        return (
          <li key={iIdx} className="list-none -ml-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={item.checked}
              readOnly
              className="rounded text-[var(--accent)] mt-1"
            />
            <span className="flex-1">{content}</span>
          </li>
        );
      }

      return (
        <li key={iIdx} className="leading-relaxed pl-1 text-[var(--text-primary)]">
          {content}
        </li>
      );
    });

    if (token.ordered) {
      return (
        <ol
          key={key}
          start={token.start ? Number(token.start) : 1}
          className="list-decimal pl-6 space-y-2 my-4 text-[14.5px]"
        >
          {children}
        </ol>
      );
    }

    return (
      <ul key={key} className="list-disc pl-6 space-y-2 my-4 text-[14.5px]">
        {children}
      </ul>
    );
  };

  function renderBlocks(list: Token[], prefix: string): React.ReactNode[] {
    return list.map((token, index) => {
      const key = `${prefix}-${index}`;

      switch (token.type) {
        case 'heading':
          return renderHeading(token as Tokens.Heading, key);

        case 'paragraph':
          return (
            <p key={key} className="leading-relaxed text-[15px]">
              {renderInlineTokens((token as Tokens.Paragraph).tokens)}
            </p>
          );

        case 'text': {
          const textToken = token as Tokens.Text;
          return (
            <React.Fragment key={key}>
              {textToken.tokens && textToken.tokens.length > 0
                ? renderInlineTokens(textToken.tokens)
                : textToken.text}
            </React.Fragment>
          );
        }

        case 'code': {
          const code = token as Tokens.Code;
          return code.lang === 'mermaid'
            ? <MermaidDiagram key={key} chart={code.text} />
            : <CodeBlock key={key} language={code.lang || 'text'} code={code.text} />;
        }

        case 'blockquote':
          return renderBlockquote(token as Tokens.Blockquote, key);

        case 'table':
          return renderTable(token as Tokens.Table, key);

        case 'list':
          return renderList(token as Tokens.List, key);

        case 'hr':
          return <hr key={key} className="my-6 border-[var(--border-subtle)]/70" />;

        case 'html':
          return (
            <div
              key={key}
              dangerouslySetInnerHTML={{ __html: (token as Tokens.HTML).text }}
              className="my-3 overflow-x-auto"
            />
          );

        case 'space':
          return null;

        default:
          return <React.Fragment key={key}>{renderInlineTokens([token])}</React.Fragment>;
      }
    });
  }

  return (
    <div className={`space-y-4 text-[14.5px] leading-relaxed text-[var(--text-primary)] ${className}`}>
      {renderBlocks(displayTokens, 'root')}
    </div>
  );
}
