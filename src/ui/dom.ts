// A tiny element builder. Text always goes in as text, never HTML.

type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Record<string, string | ((e: Event) => void)> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
