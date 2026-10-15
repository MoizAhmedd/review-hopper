// Cleans HTML rendered from a repo's markdown before it goes on the page. Markdown files often carry
// raw HTML (centred logos, <details>, <img width=...>), so it's allowed through, but only these tags
// and attributes survive. Everything else is dropped (scripts, styles, frames, forms) or unwrapped
// to its text (unknown tags). Links and images may only point at http(s), mailto, anchors or the
// repo itself; relative ones resolve against the file's folder. No id or name, so a README can't
// plant an element the page's own scripts look up.

import type { Links } from '../lib/parsers/markdown.ts';

const TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'picture', 'pre', 's', 'samp', 'source', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
]);
/** Removed with their content. */
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'textarea', 'select', 'button', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript', 'frame', 'frameset']);
const ATTRS = new Set(['href', 'src', 'srcset', 'alt', 'title', 'width', 'height', 'align', 'colspan', 'rowspan', 'open', 'start', 'type', 'checked', 'disabled', 'media']);
const URL_ATTRS = new Set(['href', 'src', 'srcset']);

function safeUrl(value: string, base: string): string | undefined {
  const v = value.trim();
  if (v.startsWith('#')) return v;
  try {
    const url = new URL(v, base);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function clean(node: Element, links: Links) {
  for (const child of [...node.children]) {
    const tag = child.tagName.toLowerCase();
    if (DROP.has(tag)) {
      child.remove();
      continue;
    }
    clean(child, links);
    if (!TAGS.has(tag)) {
      child.replaceWith(...child.childNodes);
      continue;
    }
    // Only task-list checkboxes, read-only.
    if (tag === 'input' && child.getAttribute('type') !== 'checkbox') {
      child.remove();
      continue;
    }
    for (const attr of [...child.attributes]) {
      const name = attr.name.toLowerCase();
      if (!ATTRS.has(name)) child.removeAttribute(attr.name);
      else if (URL_ATTRS.has(name)) {
        const base = name === 'href' ? links.link : links.image;
        const value = name === 'srcset'
          ? attr.value.split(',').map((part) => { const [u, ...rest] = part.trim().split(/\s+/); const s = safeUrl(u, base); return s && [s, ...rest].join(' '); }).filter(Boolean).join(', ')
          : safeUrl(attr.value, base);
        if (value) child.setAttribute(attr.name, value);
        else child.removeAttribute(attr.name);
      }
    }
    if (tag === 'input') child.setAttribute('disabled', '');
    if (tag === 'a' && child.getAttribute('href') && !child.getAttribute('href')!.startsWith('#')) {
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

/** Parses `html` into an inert document, cleans it, and returns the nodes to insert. */
export function sanitize(html: string, links: Links): DocumentFragment {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  clean(doc.body, links);
  const fragment = document.createDocumentFragment();
  fragment.append(...[...doc.body.childNodes].map((n) => document.importNode(n, true)));
  return fragment;
}
