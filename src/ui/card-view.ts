// Draws a Card. Everything from the repo goes in as text.

import type { Card, Item, Pill, Section } from '../lib/card.ts';
import { h } from './dom.ts';

const SIGN_CLASS: Record<Item['sign'], string> = { '+': 'plus', '↑': 'up', '−': 'minus', '~': 'other' };

const pillEl = (p: Pill) => h('span', { class: `rh-pill ${p.tone}` }, p.text);

function section(s: Section): HTMLElement {
  const title = s.title ? h('div', { class: 'rh-sec' }, s.title) : null;
  switch (s.type) {
    case 'list':
      return h('div', {}, title, h('div', { class: 'rh-list' }, ...s.items.flatMap((i) => [
        h('span', { class: `rh-sign ${SIGN_CLASS[i.sign]}` }, i.sign),
        h('span', { class: 'rh-mono' }, i.name),
        h('span', { class: `rh-detail ${i.tone ?? ''}` }, i.detail ?? ''),
      ])));
    case 'rows':
      return h('div', {}, title, h('div', { class: 'rh-rows' }, ...s.rows.flatMap((r) => [
        h('span', { class: 'rh-k' }, r.key),
        h('span', { class: r.mono ? 'rh-mono' : '' }, r.was !== undefined ? h('span', { class: 'rh-was' }, r.was) : null, r.value),
      ])));
    case 'flow':
      return h('div', {}, title, h('div', { class: 'rh-flow' }, ...s.steps.flatMap((step, i) => [
        i ? h('span', { class: 'rh-arrow' }, '→') : null,
        h('span', { class: `rh-step${step.highlight ? ' hl' : ''}` }, step.name, step.detail ? h('small', { class: 'rh-mono' }, step.detail) : null),
      ])));
    case 'tables':
      return h('div', {}, title, h('div', { class: 'rh-tables' }, ...s.tables.map((t) =>
        h('div', { class: 'rh-table' },
          h('div', { class: 'rh-table-h' }, t.name, t.note ? h('span', { class: 'rh-pill muted' }, t.note) : null),
          ...t.columns.map((c) => h('div', { class: `rh-col ${SIGN_CLASS[c.sign]}` },
            h('span', { class: `rh-sign ${SIGN_CLASS[c.sign]}` }, c.sign),
            h('span', { class: 'rh-mono' }, c.name),
            h('span', { class: `rh-detail ${c.tone ?? ''}` }, c.detail ?? ''))),
        ))));
  }
}

export function cardView(card: Card, rawButton: HTMLElement): HTMLElement {
  return h('div', { class: 'rh rh-card' },
    h('div', { class: 'rh-sum' }, h('b', {}, card.title), ...card.pills.map(pillEl), rawButton),
    ...card.sections.map(section),
    card.checks.length ? h('div', { class: 'rh-checks' }, ...card.checks.map(pillEl)) : null,
  );
}
