import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import supersub from 'remark-supersub';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import type { PluggableList } from 'unified';
import type { ElementType } from 'react';
import { Citation, CompositeCitation, HighlightedText } from '~/components/Web/Citation';
import { code, a, p, img, table } from './MarkdownComponents';
import { langSubset, remarkApproxTilde } from '~/utils';
import { unicodeCitation } from '~/components/Web';

/**
 * Single source of truth for the markdown rendering pipeline, shared by the
 * whole-message renderer and the per-block memoized renderer so both produce
 * identical output.
 *
 * Lazy initialization avoids reading component exports during module evaluation;
 * caching keeps react-markdown from rebuilding its processor on each render.
 */
let remarkPluginsCache: PluggableList | null = null;
let rehypePluginsCache: PluggableList | null = null;
let markdownComponentsCache: { [nodeType: string]: ElementType } | null = null;

export const getRemarkPlugins = (): PluggableList => {
  if (remarkPluginsCache === null) {
    remarkPluginsCache = [
      remarkApproxTilde,
      supersub,
      remarkGfm,
      [remarkMath, { singleDollarTextMath: false }],
      unicodeCitation,
    ];
  }
  return remarkPluginsCache;
};

export const getRehypePlugins = (): PluggableList => {
  if (rehypePluginsCache === null) {
    rehypePluginsCache = [
      [rehypeKatex],
      [rehypeHighlight, { detect: true, ignoreMissing: true, subset: langSubset }],
    ];
  }
  return rehypePluginsCache;
};

export const getMarkdownComponents = (): { [nodeType: string]: ElementType } => {
  if (markdownComponentsCache === null) {
    markdownComponentsCache = {
      code,
      a,
      p,
      img,
      table,
      citation: Citation,
      'highlighted-text': HighlightedText,
      'composite-citation': CompositeCitation,
    };
  }
  return markdownComponentsCache;
};
