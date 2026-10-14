/**
 * "Fonti" icon: a small button next to a panel or section title whose tooltip
 * lists where the data come from (src/config/data-sources.ts). Opens on hover
 * and keyboard focus, and stays open on click (touch screens).
 *
 * The tooltip lives in document.body while open: panels clip their content and
 * some of their ancestors create a containing block, so neither an absolute
 * nor a fixed tooltip inside the panel would land next to the icon.
 */

import { WORKSPACE_SOURCES, type DataSource } from '@/config/data-sources';
import { escapeHtml } from '@/utils/sanitize';

const ICON =
  '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">' +
  '<ellipse cx="8" cy="3.5" rx="5.5" ry="2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
  '<path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
  '</svg>';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function sourceItemHtml(s: DataSource): string {
  const name = s.url
    ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s.source)}</a>`
    : escapeHtml(s.source);
  const host = s.url ? `<span class="rs-source-host">${escapeHtml(hostOf(s.url))}</span>` : '';
  const note = s.note ? `<span class="rs-source-note">${escapeHtml(s.note)}</span>` : '';
  const code = s.code ? `<span class="rs-source-code">Codice: ${escapeHtml(s.code)}</span>` : '';
  return `<li><span class="rs-source-what">${escapeHtml(s.what)}</span>${name}${host}${note}${code}</li>`;
}

interface OpenTooltip {
  tooltip: HTMLElement;
  button: HTMLElement;
  pinned: boolean;
}

let current: OpenTooltip | null = null;
let globalListeners = false;

function hide(): void {
  if (!current) return;
  current.tooltip.remove();
  current.button.setAttribute('aria-expanded', 'false');
  current = null;
}

function installGlobalListeners(): void {
  if (globalListeners || typeof document === 'undefined') return;
  globalListeners = true;
  document.addEventListener('click', hide);
  // Fixed to the viewport: a scroll or resize would leave it detached from the icon.
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}

function place(tooltip: HTMLElement, anchor: HTMLElement): void {
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(380, vw * 0.8);
  tooltip.style.left = `${Math.max(8, Math.min(r.left, vw - width - 8))}px`;
  const below = vh - r.bottom - 12;
  const above = r.top - 12;
  if (below >= 200 || below >= above) {
    tooltip.style.top = `${r.bottom + 4}px`;
    tooltip.style.bottom = 'auto';
    tooltip.style.maxHeight = `${Math.max(120, below)}px`;
  } else {
    tooltip.style.top = 'auto';
    tooltip.style.bottom = `${vh - r.top + 4}px`;
    tooltip.style.maxHeight = `${Math.max(120, above)}px`;
  }
}

/** Build the icon with its tooltip; returns null when there is nothing to cite. */
export function createSourceInfo(sources: readonly DataSource[]): HTMLElement | null {
  if (!sources.length) return null;
  installGlobalListeners();

  const wrapper = document.createElement('span');
  wrapper.className = 'rs-source-info';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'rs-source-btn';
  button.setAttribute('aria-label', 'Fonti dei dati');
  button.setAttribute('aria-expanded', 'false');
  button.title = 'Fonti dei dati';
  button.innerHTML = ICON;

  const tooltip = document.createElement('div');
  tooltip.className = 'rs-source-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.innerHTML = `<strong>Fonti dei dati</strong><ul>${sources.map(sourceItemHtml).join('')}</ul>`;

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHide = (): void => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  };
  const isOpen = (): boolean => current?.tooltip === tooltip;
  const show = (pinned: boolean): void => {
    cancelHide();
    if (!isOpen()) {
      hide();
      document.body.appendChild(tooltip);
      current = { tooltip, button, pinned };
    } else if (pinned && current) {
      current.pinned = true;
    }
    place(tooltip, button);
    button.setAttribute('aria-expanded', 'true');
  };
  const hideSoon = (): void => {
    if (!isOpen() || current?.pinned) return;
    cancelHide();
    hideTimer = setTimeout(() => {
      if (isOpen() && !current?.pinned) hide();
    }, 150);
  };

  wrapper.addEventListener('mouseenter', () => show(false));
  wrapper.addEventListener('mouseleave', hideSoon);
  button.addEventListener('focus', () => show(false));
  button.addEventListener('blur', hideSoon);
  tooltip.addEventListener('mouseenter', cancelHide);
  tooltip.addEventListener('mouseleave', hideSoon);
  // Clicks inside the tooltip (links) must not reach the document listener.
  tooltip.addEventListener('click', (e) => e.stopPropagation());

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen() && current?.pinned) hide();
    else show(true);
  });

  wrapper.append(button);
  return wrapper;
}

/** Placeholder for workspace templates; filled by mountSourceInfo(). */
export function sourceInfoSlot(key: string): string {
  return `<span class="rs-source-slot" data-rs-sources="${escapeHtml(key)}"></span>`;
}

/** Replace every workspace placeholder under `root` with its "Fonti" icon. */
export function mountSourceInfo(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-rs-sources]').forEach((slot) => {
    if (slot.dataset.rsMounted === '1') return;
    const info = createSourceInfo(WORKSPACE_SOURCES[slot.dataset.rsSources ?? ''] ?? []);
    if (!info) return;
    slot.dataset.rsMounted = '1';
    slot.appendChild(info);
  });
}
