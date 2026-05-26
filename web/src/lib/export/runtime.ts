/**
 * Inline JS runtime for standalone HTML exports.
 *
 * Ships a self-contained sunburst engine — radial partition + SVG path
 * rendering + click-to-focus + breadcrumb + styled tooltip — as a string
 * embedded in the exported HTML. No framework, no external deps.
 *
 * Data shape inlined per subtree:
 *   { rootId: string, nodes: [{id, parent, label, count, color, description}] }
 */

import type { Subtree } from "../ontology/types";

export interface RuntimeNode {
  readonly id: string;
  readonly parent: string;
  readonly label: string;
  readonly count: number;
  readonly color: string;
  readonly description: string;
}

export interface RuntimeSubtree {
  readonly rootId: string;
  readonly nodes: readonly RuntimeNode[];
}

export function toRuntimeSubtree(subtree: Subtree): RuntimeSubtree {
  const nodes: RuntimeNode[] = [];
  for (const n of subtree.nodes.values()) {
    if (n.synthetic) {
      // Synthetic gap-filler — emit it so the parent chain stays connected,
      // but with a "count: 0" sentinel so it has minimal weight in the
      // partition.
      nodes.push({
        id: n.id,
        parent: n.parent,
        label: n.label || n.id,
        count: 0,
        color: n.color || "#666666",
        description: "",
      });
      continue;
    }
    nodes.push({
      id: n.id,
      parent: n.parent,
      label: n.label,
      count: n.count,
      color: n.color || "#FFFFFF",
      description: n.description,
    });
  }
  return { rootId: subtree.rootId, nodes };
}

/** Safe `</script>` neutralisation inside inlined JSON. */
export function encodeRuntimeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/* -------------------------------------------------------------------------- */
/* CSS                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Theming: caller stamps `data-theme="dark"` or `"light"` on `<html>` at
 * export time to reflect the user's current app theme. Both palettes are
 * always shipped so toggling the attribute in the exported HTML's devtools
 * works without rebuilding.
 *
 * Layout: the stage (single sunburst) and the grid (overview tiles) have
 * different sizing policies:
 *   - stage letterboxes to fit the viewport (both axes constrained)
 *   - grid shrinks horizontally to fit but is allowed to grow vertically,
 *     scrolling when the ontology has more subtrees than fit on screen
 *
 * Theme tokens — keep this list short; the SVG paint that comes from the
 * data (slice fill colors) deliberately stays untouched per theme.
 */
export const RUNTIME_CSS = `
  :root[data-theme="dark"] {
    color-scheme: dark;
    --ov-bg: #06060A;
    --ov-fg: #E5E7EB;
    --ov-fg-muted: rgba(229,231,235,0.6);
    --ov-canvas: #0B0B10;
    --ov-toolbar-bg: rgba(11,11,16,0.85);
    --ov-border: rgba(255,255,255,0.08);
    --ov-border-strong: rgba(255,255,255,0.15);
    --ov-chip-bg: rgba(255,255,255,0.04);
    --ov-chip-hover: rgba(255,255,255,0.1);
    --ov-crumb-hover: rgba(255,255,255,0.08);
    --ov-crumb-current: rgba(255,255,255,0.12);
    --ov-hover-stroke: rgba(255,255,255,0.9);
    --ov-tile-hover: rgba(255,255,255,0.35);
    --ov-tip-bg: rgba(0,0,0,0.82);
    --ov-tip-fg: #fff;
    --ov-figure-border: rgba(255,255,255,0.12);
    --ov-figure-shadow: 0 12px 36px rgba(0,0,0,0.45);
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --ov-bg: #F7F7F4;
    --ov-fg: #0F0F14;
    --ov-fg-muted: rgba(15,15,20,0.6);
    --ov-canvas: #FFFFFF;
    --ov-toolbar-bg: rgba(249,249,247,0.85);
    --ov-border: rgba(0,0,0,0.08);
    --ov-border-strong: rgba(0,0,0,0.18);
    --ov-chip-bg: rgba(0,0,0,0.04);
    --ov-chip-hover: rgba(0,0,0,0.08);
    --ov-crumb-hover: rgba(0,0,0,0.06);
    --ov-crumb-current: rgba(0,0,0,0.1);
    --ov-hover-stroke: rgba(0,0,0,0.7);
    --ov-tile-hover: rgba(0,0,0,0.35);
    --ov-tip-bg: rgba(15,15,20,0.92);
    --ov-tip-fg: #fff;
    --ov-figure-border: rgba(0,0,0,0.12);
    --ov-figure-shadow: 0 12px 36px rgba(15,15,20,0.12);
  }
  body { margin: 0; min-height: 100vh; background: var(--ov-bg); color: var(--ov-fg); font-family: ui-sans-serif, system-ui, sans-serif; }
  .ov-app { min-height: 100vh; display: flex; flex-direction: column; }
  .ov-toolbar { display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-bottom: 1px solid var(--ov-border); background: var(--ov-toolbar-bg); backdrop-filter: blur(6px); position: sticky; top: 0; z-index: 5; flex-wrap: wrap; }
  .ov-back { padding: 0.35rem 0.7rem; border-radius: 0.375rem; border: 1px solid var(--ov-border-strong); background: var(--ov-chip-bg); color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
  .ov-back:hover { background: var(--ov-chip-hover); }
  .ov-back[hidden] { display: none; }
  .ov-crumbs { display: flex; align-items: center; gap: 0.25rem; flex-wrap: wrap; font-size: 12px; }
  .ov-crumb { padding: 0.25rem 0.55rem; border-radius: 0.3rem; border: none; background: transparent; color: var(--ov-fg-muted); cursor: pointer; font: inherit; font-size: 12px; }
  .ov-crumb:hover { background: var(--ov-crumb-hover); color: var(--ov-fg); }
  .ov-crumb.is-current { background: var(--ov-crumb-current); color: var(--ov-fg); cursor: default; }
  .ov-sep { opacity: 0.4; user-select: none; }
  .ov-title { font-weight: 600; font-size: 13px; }
  /* Stage + grid share the responsive container, but with different SVG
     sizing policies (see below). 'safe center' keeps content centered when
     it fits and falls back to start-alignment once overflow kicks in. */
  .ov-stage, .ov-grid { flex: 1; display: flex; align-items: safe center; justify-content: safe center; padding: 1rem; overflow: auto; min-height: 0; }
  .ov-stage[hidden], .ov-grid[hidden] { display: none; }
  .ov-stage figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
  .ov-stage figcaption { font-size: 0.875rem; opacity: 0.7; text-align: center; }
  /* Single sunburst: letterbox to fit viewport on both axes. */
  .ov-stage svg { display: block; width: auto; height: auto; max-width: calc(100vw - 2rem); max-height: calc(100vh - 100px); border: 1px solid var(--ov-figure-border); border-radius: 12px; box-shadow: var(--ov-figure-shadow); background: var(--ov-canvas); }
  .ov-stage svg .ov-canvas-bg { fill: var(--ov-canvas); }
  .ov-stage svg path { transition: opacity 120ms ease; cursor: pointer; }
  .ov-stage svg.has-hover path:not(.is-hover) { opacity: 0.5; }
  .ov-stage svg path.is-hover { stroke: var(--ov-hover-stroke); stroke-width: 1.2; }
  /* Overview grid: shrink horizontally to fit, grow vertically as needed
     so the user can scroll through many subtrees. */
  .ov-grid svg { display: block; width: auto; height: auto; max-width: calc(100vw - 2rem); }
  .ov-grid svg .ov-canvas-bg { fill: var(--ov-bg); }
  .ov-grid svg .ov-tile-bg { fill: var(--ov-canvas); stroke: var(--ov-border); }
  .ov-grid svg text { fill: var(--ov-fg); }
  .ov-grid svg text.ov-sub { fill: var(--ov-fg-muted); }
  .ov-tile { cursor: pointer; }
  .ov-tile-hit { fill: transparent; }
  .ov-tile:hover .ov-tile-bg { stroke: var(--ov-tile-hover); }
  #ov-tip { position: fixed; pointer-events: none; z-index: 10; max-width: min(360px, calc(100vw - 16px)); padding: 0.5rem 0.75rem; border-radius: 0.375rem; background: var(--ov-tip-bg); color: var(--ov-tip-fg); font-size: 12px; line-height: 1.4; box-shadow: 0 8px 24px rgba(0,0,0,0.45); backdrop-filter: blur(6px); opacity: 0; transform: translate(-50%, calc(-100% - 12px)); transition: opacity 80ms ease; overflow-wrap: anywhere; word-break: break-word; }
  #ov-tip.is-visible { opacity: 1; }
  #ov-tip .ov-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.6; }
  #ov-tip .ov-label { font-weight: 600; margin-top: 2px; }
  #ov-tip .ov-count { margin-top: 4px; font-size: 11px; opacity: 0.85; }
  #ov-tip .ov-desc { margin-top: 6px; font-size: 11px; opacity: 0.75; white-space: pre-wrap; }
`;

export type ExportTheme = "dark" | "light";

/* -------------------------------------------------------------------------- */
/* JS                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Runtime entry. Exposes `OntoloViz.mount({ stage, subtrees, initialRootId,
 * onLeaveDetail })`. Mounts a single interactive sunburst into the given
 * stage element, wired with tooltip + breadcrumb + click-to-focus.
 *
 * Caller is responsible for hiding/showing other DOM regions (e.g. the
 * overview grid) when switching modes.
 */
export const RUNTIME_JS = `
(function(){
  var TWO_PI = 2 * Math.PI;
  var MIN_ANGLE = 1e-9;
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function fmt(n){return (typeof n === 'number' ? n.toLocaleString() : '');}

  function indexSubtree(sub){
    var byId = {};
    var children = {};
    for (var i=0;i<sub.nodes.length;i++){
      var n = sub.nodes[i];
      byId[n.id] = n;
      (children[n.parent] = children[n.parent] || []).push(n);
    }
    for (var k in children){
      children[k].sort(function(a,b){return a.id<b.id?-1:a.id>b.id?1:0;});
    }
    var valueCache = {};
    function value(id){
      if (valueCache[id] !== undefined) return valueCache[id];
      var kids = children[id] || [];
      var v;
      if (!kids.length){
        var n = byId[id];
        v = (n && n.count > 0) ? n.count : 1;
      } else {
        v = 0;
        for (var i=0;i<kids.length;i++) v += value(kids[i].id);
      }
      return valueCache[id] = v;
    }
    var heightCache = {};
    function height(id){
      if (heightCache[id] !== undefined) return heightCache[id];
      var kids = children[id] || [];
      if (!kids.length) return heightCache[id] = 0;
      var h = 0;
      for (var i=0;i<kids.length;i++) h = Math.max(h, height(kids[i].id));
      return heightCache[id] = h + 1;
    }
    function partition(focusId){
      var H = height(focusId);
      var step = 1/(H+1);
      var out = [];
      function go(id, x0, x1, depth){
        out.push({id:id, parent:byId[id].parent, depth:depth, x0:x0, x1:x1, y0:depth*step, y1:(depth+1)*step});
        var kids = children[id] || [];
        if (!kids.length) return;
        var v = value(id);
        var dx = x1 - x0;
        var c = x0;
        for (var i=0;i<kids.length;i++){
          var w = value(kids[i].id) / v * dx;
          go(kids[i].id, c, c + w, depth + 1);
          c += w;
        }
      }
      if (byId[focusId]) go(focusId, 0, TWO_PI, 0);
      return out;
    }
    function trail(focusId, rootId){
      var out = [];
      var c = focusId;
      while (c){
        out.unshift(c);
        if (c === rootId) break;
        var n = byId[c];
        if (!n || !n.parent || !byId[n.parent]) break;
        c = n.parent;
      }
      return out;
    }
    return { byId: byId, partition: partition, trail: trail };
  }

  function arcPath(cx, cy, sa, ea, r0, r1){
    var offset = -Math.PI/2;
    var a0 = sa + offset, a1 = ea + offset;
    var dA = ea - sa;
    var large = dA > Math.PI ? 1 : 0;
    var x0o = cx + r1*Math.cos(a0), y0o = cy + r1*Math.sin(a0);
    var x1o = cx + r1*Math.cos(a1), y1o = cy + r1*Math.sin(a1);
    var x0i = cx + r0*Math.cos(a1), y0i = cy + r0*Math.sin(a1);
    var x1i = cx + r0*Math.cos(a0), y1i = cy + r0*Math.sin(a0);
    if (dA >= TWO_PI - 1e-9){
      var mA = a0 + Math.PI;
      var mx = cx + r1*Math.cos(mA), my = cy + r1*Math.sin(mA);
      if (r0 <= 0){
        return 'M '+x0o+' '+y0o+' A '+r1+' '+r1+' 0 1 1 '+mx+' '+my+' A '+r1+' '+r1+' 0 1 1 '+x0o+' '+y0o+' Z';
      }
      var mix = cx + r0*Math.cos(mA), miy = cy + r0*Math.sin(mA);
      return 'M '+x0o+' '+y0o+' A '+r1+' '+r1+' 0 1 1 '+mx+' '+my+' A '+r1+' '+r1+' 0 1 1 '+x0o+' '+y0o
        +' M '+mix+' '+miy+' A '+r0+' '+r0+' 0 1 0 '+(cx+r0*Math.cos(a0))+' '+(cy+r0*Math.sin(a0))+' A '+r0+' '+r0+' 0 1 0 '+mix+' '+miy+' Z';
    }
    if (r0 <= 0){
      return 'M '+cx+' '+cy+' L '+x0o+' '+y0o+' A '+r1+' '+r1+' 0 '+large+' 1 '+x1o+' '+y1o+' Z';
    }
    return 'M '+x1i+' '+y1i+' L '+x0o+' '+y0o+' A '+r1+' '+r1+' 0 '+large+' 1 '+x1o+' '+y1o
      +' L '+x0i+' '+y0i+' A '+r0+' '+r0+' 0 '+large+' 0 '+x1i+' '+y1i+' Z';
  }

  function renderInto(svg, layout, idx, width, height){
    var cx = width/2, cy = height/2;
    var radius = Math.min(width, height)/2 - 4;
    var bg = '<rect class="ov-canvas-bg" width="'+width+'" height="'+height+'"/>';
    var paths = '';
    for (var i=0;i<layout.length;i++){
      var s = layout[i];
      var dA = s.x1 - s.x0;
      if (dA <= MIN_ANGLE) continue;
      var r0 = s.y0 * radius, r1 = s.y1 * radius;
      if (r1 <= r0) continue;
      var n = idx.byId[s.id];
      var fill = (n && n.color) ? n.color : '#FFFFFF';
      var d = arcPath(cx, cy, s.x0, s.x1, r0, r1);
      paths += '<path d="'+d+'" fill="'+fill+'" stroke="rgba(0,0,0,0.35)" stroke-width="0.5" data-id="'+esc(s.id)+'"></path>';
    }
    svg.innerHTML = bg + paths;
  }

  function renderCrumbs(host, trail, idx, onClick){
    host.innerHTML = '';
    for (var i=0;i<trail.length;i++){
      var id = trail[i];
      var n = idx.byId[id];
      var btn = document.createElement('button');
      btn.className = 'ov-crumb' + (i === trail.length - 1 ? ' is-current' : '');
      btn.textContent = (n && n.label) ? n.label : id;
      btn.setAttribute('data-id', id);
      btn.addEventListener('click', (function(target){
        return function(){ onClick(target); };
      })(id));
      host.appendChild(btn);
      if (i < trail.length - 1){
        var sep = document.createElement('span');
        sep.className = 'ov-sep';
        sep.textContent = '/';
        host.appendChild(sep);
      }
    }
  }

  function wireTooltip(svg, idx, tip){
    var current = null;
    function show(id, x, y){
      var d = idx.byId[id]; if (!d) return hide();
      if (current !== id){
        current = id;
        tip.innerHTML = '<div class="ov-id">' + esc(id) + '</div>'
          + '<div class="ov-label">' + esc(d.label || id) + '</div>'
          + '<div class="ov-count">count: ' + esc(fmt(d.count)) + '</div>'
          + (d.description ? '<div class="ov-desc">' + esc(d.description) + '</div>' : '');
      }
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden','false');
      var pad = 8;
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var vw = window.innerWidth, vh = window.innerHeight;
      var left = x;
      if (left - w/2 < pad) left = w/2 + pad;
      if (left + w/2 > vw - pad) left = vw - w/2 - pad;
      // Default: anchor bottom-edge of tip 12px above cursor (transform shifts up by full height).
      var top = y - 12;
      // If it would clip above, try placing below the cursor instead.
      if (top - h < pad) top = y + 24 + h;
      // If still clipped (tip taller than space above AND below), clamp to viewport.
      if (top - h < pad) top = h + pad;
      if (top > vh - pad) top = Math.max(h + pad, vh - pad);
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    }
    function hide(){
      current = null;
      tip.classList.remove('is-visible');
      tip.setAttribute('aria-hidden','true');
      svg.classList.remove('has-hover');
      var prev = svg.querySelector('path.is-hover');
      if (prev) prev.classList.remove('is-hover');
    }
    svg.addEventListener('mousemove', function(e){
      var t = e.target;
      if (!(t instanceof SVGPathElement)) return hide();
      var id = t.getAttribute('data-id'); if (!id) return hide();
      svg.classList.add('has-hover');
      var prev = svg.querySelector('path.is-hover');
      if (prev && prev !== t) prev.classList.remove('is-hover');
      t.classList.add('is-hover');
      show(id, e.clientX, e.clientY);
    });
    svg.addEventListener('mouseleave', hide);
  }

  window.OntoloViz = {
    mount: function(opts){
      var stage = opts.stage;
      var svg = stage.querySelector('svg');
      if (!svg) return;
      var width = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.width : 800;
      var height = svg.viewBox && svg.viewBox.baseVal ? svg.viewBox.baseVal.height : 800;
      var sub = opts.subtree;
      var idx = indexSubtree(sub);
      var focusId = opts.initialFocus && idx.byId[opts.initialFocus] ? opts.initialFocus : sub.rootId;
      var crumbHost = opts.crumbHost;
      var tip = opts.tooltip;

      function setFocus(id){
        if (!idx.byId[id]) return;
        focusId = id;
        var layout = idx.partition(id);
        renderInto(svg, layout, idx, width, height);
        if (crumbHost) renderCrumbs(crumbHost, idx.trail(id, sub.rootId), idx, setFocus);
      }

      svg.addEventListener('click', function(e){
        var t = e.target;
        if (!(t instanceof SVGPathElement)) return;
        var id = t.getAttribute('data-id');
        if (!id || !idx.byId[id]) return;
        if (id === focusId){
          var p = idx.byId[id].parent;
          if (p && idx.byId[p]) setFocus(p);
        } else {
          setFocus(id);
        }
      });

      if (tip) wireTooltip(svg, idx, tip);

      setFocus(focusId);
      return {
        setFocus: setFocus,
        reset: function(){ setFocus(sub.rootId); }
      };
    }
  };
})();
`;
