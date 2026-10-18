import { useDeferredValue, useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { desktop } from '../desktop';

const openExternal = (url: string) => { if (desktop) void desktop.openExternal(url); else window.open(url, '_blank', 'noopener'); };

/** Markdown preview (Rider's split editor for .md files): GitHub-flavoured Markdown, sanitized; links open outside. */
export default function MarkdownPreview({ source }: { source: string }) {
  const text = useDeferredValue(source);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { gfm: true, async: false }) as string), [text]);
  return (
    <article
      className="md-preview"
      aria-label="Markdown preview"
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a');
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href') ?? '';
        if (/^https?:\/\//i.test(href)) openExternal(href);
        else if (href.startsWith('#')) document.getElementById(href.slice(1))?.scrollIntoView();
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
