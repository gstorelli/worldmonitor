import { Panel } from './Panel';
import { escapeHtml } from '@/utils/sanitize';
import * as d3 from 'd3';

const THEME_LABELS: Record<string, string> = {
  A: 'Dogane & AI di frontiera',
  B: 'Supply-chain & disruption marittime',
  C: 'Multi-hazard & geospaziale',
  D: 'LLM, XAI & accountability',
  E: 'Metodologia & infrastruttura',
};

const THEME_GAPS: Record<string, string> = {
  A: 'L\'AI doganale è data-isolated: opera solo su dati dichiarativi, senza segnali esterni in tempo reale.',
  B: 'I modelli supply-chain/marittimi quantificano l\'esposizione ma sono retrospettivi: nessun early-warning operativo.',
  C: 'I framework multi-hazard validano la fusione ma confondono hazard e risk (88% dei casi, Ward et al.) e ignorano il dominio doganale.',
  D: 'La ricerca LLM/XAI offre componenti ma non un sistema assemblato e domain-grounded.',
  E: 'Metodologia e infrastruttura (DSRM, n8n, CRMF, PortWatch) forniscono l\'impalcatura ma non l\'intelligence di dominio.',
};

const THEME_COLORS: Record<string, string> = {
  A: '#3b82f6',
  B: '#f59e0b',
  C: '#10b981',
  D: '#a855f7',
  E: '#94a3b8',
};

const DIMENSION_LABELS: Record<string, string> = {
  eventSeverity: 'Severità evento',
  tradeExposure: 'Esposizione commerciale',
  routeCriticality: 'Criticità rotta',
  commoditySensitivity: 'Sensibilità commodity',
  customsRelevance: 'Rilevanza doganale',
  sourceConfidence: 'Confidenza fonte',
  escalationMomentum: 'Momentum escalation',
  geophysicalClimate: 'Geofisica/Clima',
};

const DIMENSION_COLORS: Record<string, string> = {
  eventSeverity: '#ef4444',
  tradeExposure: '#f59e0b',
  routeCriticality: '#3b82f6',
  commoditySensitivity: '#10b981',
  customsRelevance: '#a855f7',
  sourceConfidence: '#94a3b8',
  escalationMomentum: '#ec4899',
  geophysicalClimate: '#06b6d4',
};

interface ZoteroSource {
  ref: number;
  authors: string;
  year: number | string;
  title: string;
  type: string;
  venue?: string;
  doi?: string | null;
  url?: string | null;
  themeArea: string;
  summary: string;
  limitation: string;
  contribution: string;
  dimensions: string[];
  verified?: boolean;
}

interface ZoteroItem {
  key?: string;
  version?: number;
  data?: {
    key?: string;
    title?: string;
    DOI?: string;
    date?: string;
    itemType?: string;
  };
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  kind: 'hub' | 'theme' | 'source';
  label: string;
  themeArea?: string;
  source?: ZoteroSource;
  relevance?: number;
  zoteroMatched?: boolean;
  r: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

export class SourceValidationPanel extends Panel {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private simulation: d3.Simulation<SimNode, SimLink> | null = null;
  private graphGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  private nodes: SimNode[] = [];
  private links: SimLink[] = [];
  private selectedId: string | null = null;
  private activeDimensions = new Set<string>();
  private searchTerm = '';
  private libraryItems: ZoteroItem[] = [];
  private librarySource = 'none';
  private userId = '';
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private detailEl: HTMLElement | null = null;
  private tooltipEl: HTMLDivElement | null = null;

  constructor() {
    super({
      id: 'source-validation',
      title: 'Fonti & Validazione',
      className: 'panel-wide',
      closable: true,
      infoTooltip: 'Mindmap interattiva della literature review: ogni fonte è collegata all\'area tematica e al gap di ricerca che contribuisce a colmare. Clicca un nodo per i dettagli, trascina per riorganizzare, usa i filtri per esplorare le 8 dimensioni di rischio.',
    });
    this.renderLoading();
    void this.load();
    this.refreshTimer = setInterval(() => void this.load(true), 10 * 60 * 1000);
  }

  private renderLoading() {
    this.content.innerHTML = '<div style="padding: 12px; color: var(--text-secondary);">Caricamento mindmap bibliografica…</div>';
  }

  private renderError(message: string) {
    this.content.innerHTML = `<div style="padding: 12px; color: var(--color-warning);">${escapeHtml(message)}</div>`;
  }

  private async load(silent = false) {
    if (!silent) this.renderLoading();
    try {
      const resp = await fetch('/api/zotero/library', { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this.libraryItems = Array.isArray(data.library) ? data.library : [];
      this.librarySource = data.librarySource ?? 'none';
      this.userId = data.userId ?? '';
      this.buildMindmap((data.sources ?? []) as ZoteroSource[]);
    } catch (err) {
      this.renderError(`Impossibile caricare le fonti: ${(err as Error).message}`);
    }
  }

  private normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  private matchZotero(source: ZoteroSource): string | null {
    const title = this.normalizeTitle(source.title);
    const doi = (source.doi ?? '').toLowerCase();
    for (const item of this.libraryItems) {
      const data = item.data ?? {};
      if (doi && (data.DOI ?? '').toLowerCase() === doi) return data.key ?? null;
      const itemTitle = this.normalizeTitle(data.title ?? '');
      if (itemTitle && (title.includes(itemTitle) || itemTitle.includes(title))) return data.key ?? null;
    }
    return null;
  }

  private buildMindmap(sources: ZoteroSource[]) {
    const nodes: SimNode[] = [];
    const links: SimLink[] = [];
    const hubId = 'hub';
    nodes.push({ id: hubId, kind: 'hub', label: 'Risk Sentinel — Gap di ricerca', r: 46 });

    for (const area of ['A', 'B', 'C', 'D', 'E']) {
      nodes.push({ id: `theme-${area}`, kind: 'theme', label: THEME_LABELS[area] ?? area, themeArea: area, r: 30 });
      links.push({ source: hubId, target: `theme-${area}` });
    }

    for (const s of sources) {
      const matched = this.matchZotero(s);
      const relevance = Math.min(1, 0.35 + (s.dimensions?.length ?? 0) * 0.11 + (s.verified ? 0.15 : 0) + (matched ? 0.1 : 0));
      nodes.push({
        id: `src-${s.ref}`,
        kind: 'source',
        label: `[${s.ref}] ${s.title}`,
        themeArea: s.themeArea,
        source: s,
        relevance,
        zoteroMatched: Boolean(matched),
        r: 7 + relevance * 11,
      });
      links.push({ source: `theme-${s.themeArea}`, target: `src-${s.ref}` });
    }

    this.nodes = nodes;
    this.links = links;
    this.renderMindmap(sources);
  }

  private renderMindmap(sources: ZoteroSource[]) {
    const zoteroCount = this.nodes.filter((n) => n.kind === 'source' && n.zoteroMatched).length;
    this.content.innerHTML = `
      <div class="svm-root" style="display:flex; flex-direction:column; height:100%; min-height:460px;">
        <div class="svm-toolbar" style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:8px 12px; border-bottom:1px solid var(--border-color);">
          <input type="text" class="svm-search" placeholder="Cerca fonte, autore, tema…" style="flex:1; min-width:180px; padding:5px 10px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg); color:var(--text-primary); font-size:12px;"/>
          <button class="svm-reset btn btn-small" style="font-size:11px; padding:4px 8px; border-radius:6px; border:1px solid var(--border-color); background:var(--bg-hover); color:var(--text-primary); cursor:pointer;">↺ Reimposta</button>
          <div class="svm-legend" style="display:flex; gap:8px; font-size:10px; color:var(--text-secondary); align-items:center; margin-left:auto;"></div>
        </div>
        <div class="svm-dims" style="display:flex; flex-wrap:wrap; gap:4px; padding:6px 12px; border-bottom:1px solid var(--border-color);"></div>
        <div style="display:flex; flex:1; min-height:0;">
          <div class="svm-canvas" style="flex:1; min-width:0; position:relative;"></div>
          <div class="svm-detail" style="width:300px; overflow-y:auto; border-left:1px solid var(--border-color); padding:10px 12px; font-size:12px;"></div>
        </div>
      </div>`;

    const root = this.content.querySelector('.svm-root') as HTMLElement;
    const legendEl = this.content.querySelector('.svm-legend') as HTMLElement;
    const dimsEl = this.content.querySelector('.svm-dims') as HTMLElement;
    const canvasEl = this.content.querySelector('.svm-canvas') as HTMLElement;
    this.detailEl = this.content.querySelector('.svm-detail') as HTMLElement;

    for (const area of ['A', 'B', 'C', 'D', 'E']) {
      const chip = document.createElement('span');
      chip.style.cssText = `display:inline-flex;align-items:center;gap:4px;color:var(--text-secondary);`;
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${THEME_COLORS[area]};display:inline-block;`;
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(THEME_LABELS[area]?.split('&')[0] ?? area));
      legendEl.appendChild(chip);
    }
    const stat = document.createElement('span');
    stat.textContent = `${sources.length} fonti · 5 aree · ${this.links.length} connessioni · ${zoteroCount} in Zotero`;
    legendEl.appendChild(stat);

    for (const dim of Object.keys(DIMENSION_LABELS)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'svm-dim-chip';
      chip.dataset.dim = dim;
      chip.textContent = DIMENSION_LABELS[dim] ?? dim;
      chip.style.cssText = `font-size:10px; padding:2px 8px; border-radius:10px; border:1px solid ${DIMENSION_COLORS[dim]}44; background:transparent; color:var(--text-secondary); cursor:pointer;`;
      chip.addEventListener('click', () => {
        if (this.activeDimensions.has(dim)) this.activeDimensions.delete(dim);
        else this.activeDimensions.add(dim);
        this.refreshChipState();
        this.applyEmphasis();
      });
      dimsEl.appendChild(chip);
    }

    const searchInput = this.content.querySelector('.svm-search') as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      this.searchTerm = searchInput.value.toLowerCase().trim();
      this.applyEmphasis();
    });
    this.content.querySelector('.svm-reset')?.addEventListener('click', () => {
      this.searchTerm = '';
      searchInput.value = '';
      this.activeDimensions.clear();
      this.selectedId = null;
      this.refreshChipState();
      this.applyEmphasis();
      this.simulation?.alpha(1).restart();
      this.renderDetail(null);
    });

    // SVG canvas
    const width = Math.max(canvasEl.clientWidth, 320);
    const height = Math.max(root.clientHeight - 110, 420);
    const svg = d3.select(canvasEl).append('svg').attr('width', width).attr('height', height).style('display', 'block');
    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => { this.graphGroup?.attr('transform', event.transform); });
    svg.call(this.zoomBehavior);
    this.graphGroup = svg.append('g');

    const defs = this.graphGroup.append('defs');
    for (const area of ['A', 'B', 'C', 'D', 'E']) {
      defs.append('marker')
        .attr('id', `svm-arrow-${area}`)
        .attr('viewBox', '0 -5 10 10').attr('refX', 9).attr('refY', 0)
        .attr('markerWidth', 7).attr('markerHeight', 7).attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', THEME_COLORS[area] ?? '#666').attr('opacity', 0.55);
    }

    const hubId = 'hub';
    const linkSel = this.graphGroup.append('g').attr('class', 'svm-links')
      .selectAll<SVGLineElement, SimLink>('line').data(this.links).join('line')
      .attr('stroke', (d) => THEME_COLORS[(d.target as SimNode).themeArea ?? 'E'] ?? '#666')
      .attr('stroke-width', (d) => (d.source === hubId ? 2 : 1.2))
      .attr('marker-end', (d) => (d.source === hubId ? null : `url(#svm-arrow-${(d.target as SimNode).themeArea ?? 'E'})`))
      .attr('opacity', (d) => (d.source === hubId ? 0.5 : 0.35));

    const nodeSel = this.graphGroup.append('g').attr('class', 'svm-nodes')
      .selectAll<SVGGElement, SimNode>('g').data(this.nodes).join('g')
      .attr('class', (d) => `svm-node svm-${d.kind}`)
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => { if (!event.active) this.simulation?.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end', (event, d) => { if (!event.active) this.simulation?.alphaTarget(0); d.fx = null; d.fy = null; }),
      )
      .on('click', (event, d) => { event.stopPropagation(); this.selectNode(d.id); })
      .on('mouseenter', (event, d) => { this.showTooltip(event, d); })
      .on('mouseleave', () => { this.hideTooltip(); });

    nodeSel.each(function (d) {
      const g = d3.select(this);
      if (d.kind === 'hub') {
        g.append('rect')
          .attr('x', -d.r).attr('y', -26).attr('width', d.r * 2).attr('height', 52)
          .attr('rx', 12)
          .attr('fill', 'rgba(34,211,238,0.12)').attr('stroke', '#22d3ee').attr('stroke-width', 1.6);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
          .attr('fill', 'var(--text-primary, #e5e7eb)').style('font-size', '12px').style('font-weight', '700')
          .text(d.label);
      } else if (d.kind === 'theme') {
        const color = THEME_COLORS[d.themeArea ?? 'E'] ?? '#888';
        g.append('rect')
          .attr('x', -d.r).attr('y', -19).attr('width', d.r * 2).attr('height', 38)
          .attr('rx', 10).attr('fill', `${color}1f`).attr('stroke', color).attr('stroke-width', 1.4);
        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em')
          .attr('fill', 'var(--text-primary, #e5e7eb)').style('font-size', '11px').style('font-weight', '600')
          .text(d.label);
      } else {
        const color = THEME_COLORS[d.themeArea ?? 'E'] ?? '#888';
        g.append('circle')
          .attr('r', d.r)
          .attr('fill', d.source?.verified ? `${color}2e` : 'rgba(0,0,0,0.05)')
          .attr('stroke', color).attr('stroke-width', d.source?.verified ? 1.8 : 1.2)
          .attr('stroke-dasharray', d.source?.verified ? null : '3,2');
        g.append('text').attr('text-anchor', 'middle').attr('dy', '0.32em')
          .attr('fill', color).style('font-size', '9px').style('font-weight', '700')
          .text(String(d.source?.ref ?? ''));
        g.append('title').text(d.label);
      }
    });

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.style.cssText = 'position:absolute; pointer-events:none; max-width:300px; padding:8px 10px; border-radius:8px; background:var(--bg-hover, #1f2937); border:1px solid var(--border-color, #374151); color:var(--text-primary, #e5e7eb); font-size:11px; z-index:30; display:none;';
    canvasEl.appendChild(this.tooltipEl);

    this.simulation = d3.forceSimulation<SimNode>(this.nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(this.links).id((d) => (d as SimNode).id).distance((l) => ((l.source as SimNode).kind === 'hub' || (l.target as SimNode).kind === 'hub' ? 190 : 120)).strength(0.6))
      .force('charge', d3.forceManyBody().strength((d) => ((d as SimNode).kind === 'hub' ? -900 : (d as SimNode).kind === 'theme' ? -520 : -260)))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide<SimNode>().radius((d) => d.r + 10))
      .on('tick', () => {
        linkSel
          .attr('x1', (d) => (d.source as SimNode).x ?? 0).attr('y1', (d) => (d.source as SimNode).y ?? 0)
          .attr('x2', (d) => (d.target as SimNode).x ?? 0).attr('y2', (d) => (d.target as SimNode).y ?? 0);
        nodeSel.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    this.resizeObserver = new ResizeObserver(() => {
      const w = Math.max(canvasEl.clientWidth, 320);
      const h = Math.max(root.clientHeight - 110, 420);
      svg.attr('width', w).attr('height', h);
      this.simulation?.force('center', d3.forceCenter(w / 2, h / 2));
      this.simulation?.alpha(0.3).restart();
    });
    this.resizeObserver.observe(canvasEl);

    this.renderDetail(null);
  }

  private refreshChipState() {
    this.content.querySelectorAll<HTMLButtonElement>('.svm-dim-chip').forEach((chip) => {
      const dim = chip.dataset.dim ?? '';
      const active = this.activeDimensions.has(dim);
      chip.style.background = active ? `${DIMENSION_COLORS[dim] ?? '#888'}33` : 'transparent';
      chip.style.color = active ? DIMENSION_COLORS[dim] ?? '#888' : 'var(--text-secondary)';
      chip.style.borderColor = active ? DIMENSION_COLORS[dim] ?? '#888' : `${DIMENSION_COLORS[dim] ?? '#888'}44`;
    });
  }

  private nodeMatchesFilters(d: SimNode): boolean {
    if (d.kind === 'hub' || d.kind === 'theme') return true;
    const s = d.source;
    if (!s) return true;
    if (this.searchTerm) {
      const haystack = `${s.title} ${s.authors} ${THEME_LABELS[s.themeArea] ?? ''} ${s.venue ?? ''}`.toLowerCase();
      if (!haystack.includes(this.searchTerm)) return false;
    }
    if (this.activeDimensions.size > 0) {
      if (!(s.dimensions ?? []).some((dim) => this.activeDimensions.has(dim))) return false;
    }
    return true;
  }

  private applyEmphasis() {
    const selected = this.selectedId;
    this.graphGroup?.selectAll<SVGGElement, SimNode>('.svm-node')
      .style('opacity', (d) => (this.computeDimmed(d, selected) ? 0.15 : 1));
    this.graphGroup?.selectAll<SVGLineElement, SimLink>('line')
      .style('opacity', (l) => {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        const adjacent = !selected || s.id === selected || t.id === selected;
        const bothVisible = !this.computeDimmed(s, null) && !this.computeDimmed(t, null);
        if (!bothVisible) return 0.05;
        return adjacent ? 0.9 : (selected ? 0.12 : 0.45);
      });
  }

  private computeDimmed(d: SimNode, selected: string | null): boolean {
    if (!this.nodeMatchesFilters(d)) return true;
    if (!selected) return false;
    if (d.id === selected) return false;
    if (selected.startsWith('theme-')) {
      return d.themeArea !== selected.replace('theme-', '') && d.kind !== 'hub';
    }
    if (selected.startsWith('src-')) {
      if (d.kind === 'theme') {
        return d.themeArea !== this.nodes.find((n) => n.id === selected)?.themeArea;
      }
      return d.kind !== 'hub' && d.id !== selected;
    }
    return false;
  }

  private selectNode(id: string) {
    this.selectedId = id;
    const node = this.nodes.find((n) => n.id === id);
    this.applyEmphasis();
    this.renderDetail(node ?? null);
  }

  private showTooltip(event: MouseEvent, d: SimNode) {
    if (!this.tooltipEl) return;
    if (d.kind === 'source' && d.source) {
      this.tooltipEl.innerHTML = `<strong>${escapeHtml(d.source.title)}</strong><br/><span style="color:var(--text-secondary)">${escapeHtml(d.source.authors)} (${escapeHtml(String(d.source.year))}) — ${escapeHtml(THEME_LABELS[d.source.themeArea] ?? d.source.themeArea)}</span>`;
    } else if (d.kind === 'theme') {
      this.tooltipEl.innerHTML = `<strong>${escapeHtml(d.label)}</strong><br/><span style="color:var(--text-secondary)">${escapeHtml(THEME_GAPS[d.themeArea ?? ''] ?? '')}</span>`;
    } else {
      this.tooltipEl.textContent = 'Clicca un\'area tematica o una fonte per esplorare il gap di ricerca.';
    }
    const canvasEl = this.content.querySelector('.svm-canvas') as HTMLElement;
    const rect = canvasEl.getBoundingClientRect();
    this.tooltipEl.style.display = 'block';
    this.tooltipEl.style.left = `${event.clientX - rect.left + 14}px`;
    this.tooltipEl.style.top = `${event.clientY - rect.top + 10}px`;
  }

  private hideTooltip() {
    if (this.tooltipEl) this.tooltipEl.style.display = 'none';
  }

  private renderDetail(node: SimNode | null) {
    if (!this.detailEl) return;
    if (!node) {
      const gaps = Object.entries(THEME_GAPS)
        .map(([area, gap]) => `<div style="margin:6px 0; padding:8px; border-left:3px solid ${THEME_COLORS[area]}; background:rgba(0,0,0,0.15); border-radius:4px; font-size:11px;"><strong style="color:${THEME_COLORS[area]}">${escapeHtml(THEME_LABELS[area] ?? area)}</strong><br/><span style="color:var(--text-secondary)">${escapeHtml(gap)}</span></div>`)
        .join('');
      this.detailEl.innerHTML = `
        <div style="font-weight:700; font-size:13px; color:var(--text-primary); margin-bottom:6px;">Il gap di ricerca</div>
        <div style="color:var(--text-secondary); font-size:11px; margin-bottom:8px;">La letteratura è frammentata: ogni contributo copre una fetta del problema. Le 5 parzialità qui sotto sono il motivo del dottorato.</div>
        ${gaps}
        <div style="color:var(--text-secondary); font-size:11px; margin-top:10px;">💡 Trascina i nodi per riorganizzare, usa la ricerca e i filtri per dimensione di rischio, clicca un nodo per i dettagli.</div>`;
      return;
    }
    if (node.kind === 'hub') {
      this.renderDetail(null);
      return;
    }
    if (node.kind === 'theme') {
      const sources = this.nodes.filter((n) => n.kind === 'source' && n.themeArea === node.themeArea);
      const area = node.themeArea ?? '';
      this.detailEl.innerHTML = `
        <div style="font-weight:700; font-size:13px; color:${THEME_COLORS[area]}; margin-bottom:4px;">${escapeHtml(node.label)}</div>
        <div style="color:var(--text-secondary); font-size:11px; margin-bottom:8px;">${escapeHtml(THEME_GAPS[area] ?? '')}</div>
        <div style="font-size:11px; color:var(--text-primary); margin-bottom:4px;">${sources.length} fonti collegate:</div>
        ${sources.map((s) => `<div class="svm-mini" data-ref="${s.source?.ref}" style="cursor:pointer; padding:4px 6px; margin:2px 0; border-radius:4px; background:var(--bg-hover); font-size:11px; color:var(--text-primary);">[${s.source?.ref}] ${escapeHtml((s.source?.title ?? '').slice(0, 90))}</div>`).join('')}`;
      this.detailEl.querySelectorAll<HTMLElement>('.svm-mini').forEach((el) => {
        el.addEventListener('click', () => this.selectNode(`src-${el.dataset.ref}`));
      });
      return;
    }
    const s = node.source;
    if (!s) return;
    const color = THEME_COLORS[s.themeArea] ?? '#888';
    const zoteroKey = node.zoteroMatched && this.libraryItems.find((i) => (i.data?.DOI ?? '').toLowerCase() === (s.doi ?? '').toLowerCase() || this.normalizeTitle(i.data?.title ?? '').includes(this.normalizeTitle(s.title)))?.data?.key;
    const zoteroUrl = zoteroKey && this.userId ? `https://www.zotero.org/${this.userId}/items/${zoteroKey}` : null;
    const link = s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" style="color:#22d3ee;">${escapeHtml(s.title)}</a>` : escapeHtml(s.title);
    const dimChips = (s.dimensions ?? [])
      .map((d) => `<span style="display:inline-block; margin:2px; padding:1px 8px; border-radius:9px; font-size:10px; background:${DIMENSION_COLORS[d] ?? '#888'}22; color:${DIMENSION_COLORS[d] ?? '#888'};">${escapeHtml(DIMENSION_LABELS[d] ?? d)}</span>`)
      .join('');
    const relevancePct = Math.round((node.relevance ?? 0) * 100);
    this.detailEl.innerHTML = `
      <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${link}</div>
      <div style="font-size:11px; color:var(--text-secondary); margin-bottom:6px;"><strong>${escapeHtml(s.authors)}</strong> (${escapeHtml(String(s.year))}) · ${escapeHtml(s.venue ?? '')}${s.doi ? ` · doi:${escapeHtml(s.doi)}` : ''}</div>
      <div style="margin-bottom:6px;">${dimChips}</div>
      <div style="font-size:11px; color:var(--text-secondary); margin:6px 0;">
        <div style="margin-bottom:2px;">Rilevanza per il dottorato: <strong style="color:${color};">${relevancePct}%</strong></div>
        <div style="height:5px; background:var(--bg-hover); border-radius:3px; overflow:hidden;"><div style="width:${relevancePct}%; height:100%; background:${color}; border-radius:3px;"></div></div>
      </div>
      <div style="font-size:12px; color:var(--text-secondary); margin:6px 0;">${escapeHtml(s.summary)}</div>
      <div style="font-size:12px; margin:6px 0;"><span style="color:var(--color-warning);">⚠ Limite:</span> <span style="color:var(--text-secondary);">${escapeHtml(s.limitation)}</span></div>
      <div style="font-size:12px; margin:6px 0;"><span style="color:#10b981;">✓ Contributo:</span> <span style="color:var(--text-secondary);">${escapeHtml(s.contribution)}</span></div>
      <div style="font-size:11px; margin-top:8px;">
        ${zoteroUrl
          ? `<a href="${escapeHtml(zoteroUrl)}" target="_blank" rel="noopener noreferrer" style="color:#22d3ee;">📚 Presente in Zotero (${escapeHtml(this.librarySource === 'zotero' ? 'libreria sincronizzata' : 'catalogo curato')})</a>`
          : (this.librarySource === 'zotero'
            ? '<span style="color:var(--text-secondary);">Non ancora archiviata in Zotero.</span>'
            : '<span style="color:var(--text-secondary);">Zotero non collegato — solo catalogo curato.</span>')}
      </div>`;
  }

  public override destroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.simulation) this.simulation.stop();
    super.destroy();
  }
}
