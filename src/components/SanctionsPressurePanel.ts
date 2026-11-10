import { Panel } from './Panel';
import { t } from '@/services/i18n';
import type { CountrySanctionsPressure, ProgramSanctionsPressure, SanctionsEntry, SanctionsPressureResult } from '@/services/sanctions-pressure';
import { escapeHtml } from '@/utils/sanitize';

/** /api/sanctions/eu: EU consolidated list, counts only (thesis issue #92). */
export interface EuSanctionsSummary {
  available: boolean;
  generationDate?: string | null;
  recentDays?: number;
  total?: number;
  persons?: number;
  enterprises?: number;
  recent?: number;
  lastDesignation?: string | null;
  programmes?: Array<{ programme: string; total: number; recent: number; persons: number; enterprises: number }>;
  enterpriseCountries?: Array<{ code: string; count: number }>;
}

let regionNames: Intl.DisplayNames | undefined;
try {
  regionNames = new Intl.DisplayNames(['it'], { type: 'region' });
} catch {
  regionNames = undefined;
}

export class SanctionsPressurePanel extends Panel {
  private data: SanctionsPressureResult | null = null;
  private euData: EuSanctionsSummary | null = null;
  /** EU first: the thesis is about EU customs (#92). */
  private activeTab: 'eu' | 'us' = 'eu';

  constructor() {
    super({
      id: 'sanctions-pressure',
      title: t('components.sanctionsPressure.title'),
      showCount: true,
      trackActivity: true,
      defaultRowSpan: 2,
      infoTooltip: t('components.sanctionsPressure.infoTooltip'),
    });
    this.showLoading(t('components.sanctionsPressure.loading'));
    this.content.addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('.panel-tab[data-sanctions-tab]');
      if (!tab) return;
      this.activeTab = tab.dataset.sanctionsTab === 'us' ? 'us' : 'eu';
      this.render();
    });
  }

  public setEuData(data: EuSanctionsSummary): void {
    this.euData = data;
    this.render();
  }

  private tabsHtml(): string {
    return `<div class="panel-tabs">
      <button class="panel-tab ${this.activeTab === 'eu' ? 'active' : ''}" data-sanctions-tab="eu">UE</button>
      <button class="panel-tab ${this.activeTab === 'us' ? 'active' : ''}" data-sanctions-tab="us">USA (OFAC)</button>
    </div>`;
  }

  private renderEu(): void {
    const d = this.euData;
    if (!d?.available) {
      this.setContent(`${this.tabsHtml()}<div class="economic-empty">Lista UE non ancora disponibile: si aggiorna ogni 6 ore.</div>`);
      return;
    }
    const country = (code: string): string => {
      try {
        return regionNames?.of(code) ?? code;
      } catch {
        return code;
      }
    };
    const last = d.lastDesignation ? new Date(d.lastDesignation).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : 'n.d.';
    const programmes = (d.programmes ?? []).slice(0, 8).map((p) => `
      <div class="sanctions-row">
        <div class="sanctions-row-main">
          <div class="sanctions-row-title">${escapeHtml(p.programme)}</div>
          <div class="sanctions-row-meta">${p.total} soggetti · ${p.persons} persone · ${p.enterprises} enti</div>
        </div>
        <div class="sanctions-row-flags">${p.recent > 0 ? `<span class="sanctions-pill sanctions-pill-new">+${p.recent} in ${d.recentDays} gg</span>` : ''}</div>
      </div>`).join('');
    const countries = (d.enterpriseCountries ?? []).slice(0, 8).map((c) => `
      <div class="sanctions-row">
        <div class="sanctions-row-main">
          <div class="sanctions-row-title">${escapeHtml(country(c.code))}</div>
          <div class="sanctions-row-meta">${escapeHtml(c.code)} · ${c.count} enti</div>
        </div>
      </div>`).join('');
    const file = d.generationDate ? new Date(d.generationDate).toLocaleDateString('it-IT') : 'n.d.';
    this.setContent(`
      ${this.tabsHtml()}
      <div class="sanctions-panel-content">
        <div class="sanctions-summary">
          ${this.renderSummaryCard('Soggetti in lista', d.total ?? 0)}
          ${this.renderSummaryCard('Enti', d.enterprises ?? 0)}
          ${this.renderSummaryCard(`Nuovi in ${d.recentDays ?? 30} gg (ultimo: ${last})`, d.recent ?? 0, (d.recent ?? 0) > 0 ? 'highlight' : '')}
        </div>
        <div class="sanctions-sections">
          <div class="sanctions-section">
            <div class="sanctions-section-title">Regimi di sanzione (codice della lista UE)</div>
            <div class="sanctions-list">${programmes}</div>
          </div>
          <div class="sanctions-section">
            <div class="sanctions-section-title">Enti sanzionati per paese</div>
            <div class="sanctions-list">${countries}</div>
          </div>
        </div>
        <div class="economic-footer">${escapeHtml(`Lista consolidata UE delle sanzioni finanziarie (Commissione europea), file del ${file} · solo conteggi, nessun dato personale`)}</div>
      </div>
    `);
  }

  public setData(data: SanctionsPressureResult): void {
    this.data = data;
    this.render();
  }

  private render(): void {
    // The header count follows the active tab (EU list or OFAC), never mixes them.
    const count = this.activeTab === 'eu' ? (this.euData?.available ? this.euData.total : undefined) : this.data?.totalCount;
    if (typeof count === 'number') this.setCount(count);
    if (this.activeTab === 'eu') {
      this.renderEu();
      return;
    }
    if (!this.data || this.data.totalCount === 0) {
      this.setContent(`${this.tabsHtml()}<div class="economic-empty">${escapeHtml(t('components.sanctionsPressure.unavailable'))}</div>`);
      return;
    }

    const data = this.data;

    const summaryHtml = `
      <div class="sanctions-summary">
        ${this.renderSummaryCard(t('components.sanctionsPressure.summary.new'), data.newEntryCount, data.newEntryCount > 0 ? 'highlight' : '')}
        ${this.renderSummaryCard(t('components.sanctionsPressure.summary.vessels'), data.vesselCount)}
        ${this.renderSummaryCard(t('components.sanctionsPressure.summary.aircraft'), data.aircraftCount)}
      </div>
    `;

    const countriesHtml = data.countries.length > 0
      ? data.countries.slice(0, 8).map((country) => this.renderCountryRow(country)).join('')
      : `<div class="economic-empty">${escapeHtml(t('components.sanctionsPressure.empty.countries'))}</div>`;

    const entriesHtml = data.entries.length > 0
      ? data.entries.slice(0, 10).map((entry) => this.renderEntryRow(entry)).join('')
      : `<div class="economic-empty">${escapeHtml(t('components.sanctionsPressure.empty.entries'))}</div>`;

    const programsHtml = data.programs.length > 0
      ? data.programs.slice(0, 6).map((program) => this.renderProgramRow(program)).join('')
      : `<div class="economic-empty">${escapeHtml(t('components.sanctionsPressure.empty.programs'))}</div>`;

    const footer = [
      t('components.sanctionsPressure.footer.updated', { time: data.fetchedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }),
      data.datasetDate ? t('components.sanctionsPressure.footer.dataset', { date: data.datasetDate.toISOString().slice(0, 10) }) : '',
      t('components.sanctionsPressure.footer.source'),
    ].filter(Boolean).join(' · ');

    this.setContent(`
      ${this.tabsHtml()}
      <div class="sanctions-panel-content">
        ${summaryHtml}
        <div class="sanctions-sections">
          <div class="sanctions-section">
            <div class="sanctions-section-title">${escapeHtml(t('components.sanctionsPressure.sections.countries'))}</div>
            <div class="sanctions-list">${countriesHtml}</div>
          </div>
          <div class="sanctions-section">
            <div class="sanctions-section-title">${escapeHtml(t('components.sanctionsPressure.sections.entries'))}</div>
            <div class="sanctions-list">${entriesHtml}</div>
          </div>
          <div class="sanctions-section">
            <div class="sanctions-section-title">${escapeHtml(t('components.sanctionsPressure.sections.programs'))}</div>
            <div class="sanctions-list">${programsHtml}</div>
          </div>
        </div>
        <div class="economic-footer">${escapeHtml(footer)}</div>
      </div>
    `);
  }

  private renderSummaryCard(label: string, value: string | number, tone = ''): string {
    return `
      <div class="sanctions-summary-card ${tone ? `sanctions-summary-card-${tone}` : ''}">
        <span class="sanctions-summary-label">${escapeHtml(label)}</span>
        <span class="sanctions-summary-value">${escapeHtml(String(value))}</span>
      </div>
    `;
  }

  private renderCountryRow(country: CountrySanctionsPressure): string {
    const flags: string[] = [];
    if (country.newEntryCount > 0) flags.push(`<span class="sanctions-pill sanctions-pill-new">${escapeHtml(t('components.sanctionsPressure.pills.newCount', { count: country.newEntryCount }))}</span>`);
    if (country.vesselCount > 0) flags.push(`<span class="sanctions-pill">🚢 ${country.vesselCount}</span>`);
    if (country.aircraftCount > 0) flags.push(`<span class="sanctions-pill">✈ ${country.aircraftCount}</span>`);

    return `
      <div class="sanctions-row">
        <div class="sanctions-row-main">
          <div class="sanctions-row-title">${escapeHtml(country.countryName)}</div>
          <div class="sanctions-row-meta">${escapeHtml(country.countryCode)} · ${escapeHtml(t('components.sanctionsPressure.designations', { count: country.entryCount }))}</div>
        </div>
        <div class="sanctions-row-flags">${flags.join('')}</div>
      </div>
    `;
  }

  private renderProgramRow(program: ProgramSanctionsPressure): string {
    return `
      <div class="sanctions-row">
        <div class="sanctions-row-main">
          <div class="sanctions-row-title">${escapeHtml(program.program)}</div>
          <div class="sanctions-row-meta">${escapeHtml(t('components.sanctionsPressure.designations', { count: program.entryCount }))}</div>
        </div>
        <div class="sanctions-row-flags">
          ${program.newEntryCount > 0 ? `<span class="sanctions-pill sanctions-pill-new">${escapeHtml(t('components.sanctionsPressure.pills.newCount', { count: program.newEntryCount }))}</span>` : ''}
        </div>
      </div>
    `;
  }

  private renderEntryRow(entry: SanctionsEntry): string {
    const location = entry.countryNames[0] || entry.countryCodes[0] || t('components.sanctionsPressure.fallbacks.unattributed');
    const program = entry.programs[0] || t('components.sanctionsPressure.fallbacks.program');
    const note = entry.note ? `<div class="sanctions-entry-note">${escapeHtml(entry.note)}</div>` : '';
    const effective = entry.effectiveAt ? entry.effectiveAt.toISOString().slice(0, 10) : t('components.sanctionsPressure.fallbacks.undated');

    return `
      <div class="sanctions-entry">
        <div class="sanctions-entry-top">
          <span class="sanctions-entry-name">${escapeHtml(entry.name)}</span>
          <span class="sanctions-pill sanctions-pill-type">${escapeHtml(entry.entityType)}</span>
          ${entry.isNew ? `<span class="sanctions-pill sanctions-pill-new">${escapeHtml(t('components.sanctionsPressure.pills.new'))}</span>` : ''}
        </div>
        <div class="sanctions-entry-meta">${escapeHtml(location)} · ${escapeHtml(program)} · ${escapeHtml(effective)}</div>
        ${note}
      </div>
    `;
  }
}
