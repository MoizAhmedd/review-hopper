// One stylesheet for both sites. Colours come from the site's own theme variables (GitLab's
// --gl-*, GitHub's Primer --fgColor-* and friends), so light and dark themes both work.

export const CSS = `
.rh {
  --rh-fg: var(--gl-text-color-default, var(--fgColor-default, #3a383f));
  --rh-muted: var(--gl-text-color-subtle, var(--fgColor-muted, #737278));
  --rh-border: var(--gl-border-color-default, var(--borderColor-default, #dcdcde));
  --rh-bg: var(--gl-background-color-default, var(--bgColor-default, #fff));
  --rh-subtle: var(--gl-background-color-subtle, var(--bgColor-muted, #f5f5f7));
  --rh-ok: var(--gl-text-color-success, var(--fgColor-success, #108548));
  --rh-warn: var(--gl-text-color-warning, var(--fgColor-attention, #9e5400));
  --rh-bad: var(--gl-text-color-danger, var(--fgColor-danger, #c91c00));
  --rh-link: var(--gl-text-color-link, var(--fgColor-accent, #1f75cb));
  color: var(--rh-fg);
  font-size: 14px;
  line-height: 1.5;
}
.rh * { box-sizing: border-box; }
.rh-mono, .rh code { font-family: var(--default-mono-font, var(--fontStack-monospace, ui-monospace, Menlo, monospace)); font-size: 12.5px; }
[data-rh-hide] { display: none !important; }
[data-rh-list] { display: flex !important; flex-direction: column; }
[data-rh-flat] { display: contents !important; }
/* The list's own extras (GitHub's "You made it to the end!", loading markers) go after the files. */
[data-rh-list] > :not([data-rh-order]):not([data-rh-flat]):not(.rh-band),
[data-rh-flat] > :not([data-rh-order]):not([data-rh-flat]) { order: 95; }
[data-rh-order="1"] { order: 1 !important; }
[data-rh-order="2"] { order: 2 !important; }
[data-rh-order="3"] { order: 3 !important; }
[data-rh-order="4"] { order: 4 !important; }
[data-rh-list] > .rh-band { order: 90 !important; }

/* Pills and buttons */
.rh-pill { display: inline-block; font-size: 12px; font-weight: 500; border-radius: 10px; padding: 0 8px; line-height: 20px; white-space: nowrap; }
.rh-pill.ok { color: var(--rh-ok); background: color-mix(in srgb, var(--rh-ok) 14%, transparent); }
.rh-pill.warn { color: var(--rh-warn); background: color-mix(in srgb, var(--rh-warn) 16%, transparent); }
.rh-pill.bad { color: var(--rh-bad); background: color-mix(in srgb, var(--rh-bad) 14%, transparent); }
.rh-pill.muted { color: var(--rh-muted); background: color-mix(in srgb, var(--rh-muted) 14%, transparent); }
.rh-btn { font: inherit; font-size: 12px; font-weight: 500; color: var(--rh-fg); background: var(--rh-bg); border: 1px solid var(--rh-border); border-radius: 6px; padding: 2px 10px; cursor: pointer; }
.rh-btn:hover { background: var(--rh-subtle); }
.rh-btn.primary { background: var(--rh-link); border-color: var(--rh-link); color: #fff; }
.rh-seg { display: inline-flex; border: 1px solid var(--rh-border); border-radius: 6px; overflow: hidden; margin-right: 8px; vertical-align: middle; }
.rh-seg button { font: inherit; font-size: 12px; border: 0; background: transparent; color: var(--rh-muted); padding: 2px 10px; cursor: pointer; }
.rh-seg button[aria-pressed="true"] { background: var(--rh-fg); color: var(--rh-bg); }

/* Tree */
.rh-tree { padding: 4px 8px 16px 4px; }
.rh-tree-head { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; padding: 4px 8px 10px; border-bottom: 1px solid var(--rh-border); margin-bottom: 8px; color: var(--rh-muted); font-size: 13px; }
.rh-tree-head b { color: var(--rh-fg); font-size: 14px; white-space: nowrap; }
.rh-tree-head .rh-btn { white-space: nowrap; }
.rh-tree-head .rh-btn { margin-left: auto; }
.rh-group { margin: 2px 0 8px; }
.rh-gh { display: flex; align-items: center; gap: 8px; padding: 5px 8px; font-weight: 600; border-radius: 6px; cursor: pointer; user-select: none; }
.rh-gh:hover { background: var(--rh-subtle); }
.rh-gh .rh-n { font-weight: 400; font-size: 12px; color: var(--rh-muted); background: var(--rh-subtle); border-radius: 10px; padding: 0 7px; }
.rh-gh .rh-meta { margin-left: auto; font-weight: 400; font-size: 12px; color: var(--rh-muted); }
.rh-chev { width: 10px; color: var(--rh-muted); font-size: 10px; }
.rh-f { display: flex; gap: 8px; padding: 3px 8px 3px 26px; font-size: 13px; border-radius: 6px; cursor: pointer; }
.rh-f:hover { background: var(--rh-subtle); }
.rh-f .rh-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rh-f .rh-s { margin-left: auto; font-size: 12px; white-space: nowrap; }
.rh-a { color: var(--rh-ok); } .rh-r { color: var(--rh-bad); margin-left: 4px; }
.rh-hidden-group { margin-top: 12px; border-top: 1px solid var(--rh-border); padding-top: 8px; }
.rh-why { padding: 2px 8px 0; display: flex; flex-wrap: wrap; gap: 4px; }

/* Hidden-files bar at the end of the list */
.rh-band { display: flex; align-items: center; gap: 12px; border: 1px dashed var(--rh-border); border-radius: 8px; padding: 12px 16px; margin: 8px 0 24px; }
.rh-band .rh-sub { color: var(--rh-muted); font-size: 13px; }
.rh-band .rh-btn { margin-left: auto; }

/* Cards */
.rh-card { padding: 14px 18px 16px; background: var(--rh-bg); }
.rh-sum { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.rh-sum b { font-size: 15px; margin-right: 2px; }
.rh-sum .rh-btn { margin-left: auto; }
.rh-sec { color: var(--rh-muted); font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; margin: 12px 0 4px; }
.rh-list { display: grid; grid-template-columns: 18px minmax(0, max-content) 1fr; gap: 3px 10px; align-items: baseline; }
.rh-sign { font-weight: 700; text-align: center; }
.rh-sign.plus { color: var(--rh-ok); } .rh-sign.up { color: var(--rh-link); } .rh-sign.minus { color: var(--rh-bad); } .rh-sign.other { color: var(--rh-warn); }
.rh-detail { color: var(--rh-muted); font-size: 13px; }
.rh-detail.warn { color: var(--rh-warn); } .rh-detail.bad { color: var(--rh-bad); }
.rh-rows { display: grid; grid-template-columns: 140px 1fr; gap: 5px 16px; font-size: 13.5px; margin-top: 4px; }
.rh-rows .rh-k { color: var(--rh-muted); }
.rh-was { color: var(--rh-muted); text-decoration: line-through; margin-right: 8px; }
.rh-flow { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; margin: 2px 0 12px; }
.rh-step { border: 1px solid var(--rh-border); border-radius: 8px; padding: 5px 11px; background: var(--rh-subtle); max-width: 300px; }
.rh-step small { display: block; color: var(--rh-muted); font-size: 11.5px; }
.rh-step.hl { border-color: var(--rh-link); background: color-mix(in srgb, var(--rh-link) 10%, var(--rh-bg)); }
.rh-arrow { align-self: center; color: var(--rh-muted); }
.rh-tables { display: flex; gap: 12px; flex-wrap: wrap; }
.rh-table { border: 1px solid var(--rh-border); border-radius: 8px; min-width: 280px; overflow: hidden; }
.rh-table-h { background: var(--rh-subtle); padding: 5px 12px; font-weight: 600; font-size: 13.5px; border-bottom: 1px solid var(--rh-border); display: flex; gap: 8px; align-items: center; }
.rh-col { display: flex; gap: 10px; padding: 3px 12px; font-size: 13px; }
.rh-col .rh-detail { margin-left: auto; padding-left: 16px; }
.rh-col.plus { background: color-mix(in srgb, var(--rh-ok) 9%, transparent); }
.rh-col.minus { background: color-mix(in srgb, var(--rh-bad) 9%, transparent); }
.rh-checks { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.rh-note { color: var(--rh-muted); font-size: 13px; padding: 10px 18px; }

/* Rendered markdown */
.rh-md { padding: 12px 32px 20px; background: var(--rh-bg); font-size: 15px; line-height: 1.6; }
.rh-md table { border-collapse: collapse; margin: 8px 0; display: block; overflow-x: auto; }
.rh-md td, .rh-md th { border: 1px solid var(--rh-border); padding: 5px 10px; text-align: left; vertical-align: top; }
.rh-md th { background: var(--rh-subtle); }
.rh-md code { background: var(--rh-subtle); border-radius: 4px; padding: 1px 4px; }
.rh-md pre { background: var(--rh-subtle); border-radius: 6px; padding: 10px 12px; overflow-x: auto; }
.rh-md pre code { background: none; padding: 0; }
.rh-md a { color: var(--rh-link); }
.rh-md img { max-width: 100%; }
.rh-md blockquote { border-left: 3px solid var(--rh-border); margin: 0; padding-left: 12px; color: var(--rh-muted); }
.rh-blk { position: relative; padding: 0 4px; margin: 0 -4px; border-radius: 4px; }
.rh-blk.added, .rh-blk.changed { background: color-mix(in srgb, var(--rh-ok) 9%, transparent); }
.rh-blk.added::before, .rh-blk.changed::before, .rh-blk.removed::before { content: ''; position: absolute; left: -14px; top: 0; bottom: 0; width: 3px; border-radius: 2px; background: var(--rh-ok); }
.rh-blk.changed::before { background: var(--rh-link); }
.rh-blk.removed { background: color-mix(in srgb, var(--rh-bad) 8%, transparent); text-decoration: line-through; color: var(--rh-muted); }
.rh-blk.removed::before { background: var(--rh-bad); }
.rh-blk .rh-old { border-top: 1px dashed var(--rh-border); margin-top: 4px; padding-top: 4px; color: var(--rh-muted); }
.rh-blk-tools { position: absolute; right: -6px; top: 2px; display: none; gap: 4px; }
.rh-blk:hover .rh-blk-tools { display: flex; }
.rh-composer { border: 1px solid var(--rh-border); border-radius: 8px; padding: 8px; margin: 6px 0 10px; background: var(--rh-bg); }
.rh-composer textarea { width: 100%; min-height: 64px; font: inherit; font-size: 14px; color: var(--rh-fg); background: var(--rh-bg); border: 1px solid var(--rh-border); border-radius: 6px; padding: 6px 8px; }
.rh-composer .rh-row { display: flex; gap: 8px; align-items: center; margin-top: 6px; color: var(--rh-muted); font-size: 12px; }
.rh-composer .rh-row .rh-btn:first-of-type { margin-left: auto; }
`;
