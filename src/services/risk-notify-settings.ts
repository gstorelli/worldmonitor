import { escapeHtml } from '@/utils/sanitize';

export interface RiskNotifyResult {
  html: string;
  attach: (container: HTMLElement) => () => void;
}

interface NotifyConfig {
  endpoints?: {
    telegram?: { enabled?: boolean; chatId?: string };
    email?: { enabled?: boolean; from?: string; to?: string };
  };
  frequency?: 'realtime' | 'hourly' | 'daily' | 'weekly';
  topics?: string[];
  enrichment?: 'fact' | 'analysis' | 'regulatory';
}

const TOPICS: Array<{ id: string; label: string }> = [
  { id: 'chokepoints', label: 'Chokepoint & rotte commerciali' },
  { id: 'conflicts', label: 'Conflitti (ACLED)' },
  { id: 'commodities', label: 'Commodity & dogane' },
  { id: 'climate', label: 'Anomalie climatiche' },
  { id: 'seismic', label: 'Terremoti' },
  { id: 'policy', label: 'Monitor normativo UE' },
];

async function loadConfig(signal: AbortSignal): Promise<NotifyConfig | null> {
  const res = await fetch('/api/notify/config', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.config as NotifyConfig) ?? null;
}

async function saveConfig(config: NotifyConfig): Promise<void> {
  const res = await fetch('/api/notify/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body.error as string) || `HTTP ${res.status}`);
  }
}

export function renderRiskNotifySettings(): RiskNotifyResult {
  const html = `<div class="wm-pref-group-content wm-notif-tab-content">
    <div class="us-notif-loading" id="rkNotifLoading">Caricamento…</div>
    <div class="us-notif-content" id="rkNotifContent" style="display:none"></div>
  </div>`;

  return {
    html,
    attach(container: HTMLElement): () => void {
      const ac = new AbortController();
      const { signal } = ac;
      let current: NotifyConfig | null = null;
      let saveTimer: ReturnType<typeof setTimeout> | null = null;

      const render = (config: NotifyConfig | null): void => {
        const loadingEl = container.querySelector<HTMLElement>('#rkNotifLoading');
        const contentEl = container.querySelector<HTMLElement>('#rkNotifContent');
        if (!loadingEl || !contentEl) return;

        const tg = config?.endpoints?.telegram;
        const email = config?.endpoints?.email;
        const frequency = config?.frequency ?? 'hourly';
        const topics = config?.topics ?? [];
        const enrichment = config?.enrichment ?? 'fact';
        const tgConnected = Boolean(tg?.enabled && tg?.chatId);
        const emailConnected = Boolean(email?.enabled && email?.to);

        const freqOptions = [
          ['realtime', 'Tempo reale'],
          ['hourly', 'Ogni ora'],
          ['daily', 'Ogni giorno'],
          ['weekly', 'Ogni settimana'],
        ]
          .map(([v, label]) => `<option value="${v}"${frequency === v ? ' selected' : ''}>${label}</option>`)
          .join('');

        const topicRows = TOPICS.map((t) => `
          <label class="ai-flow-toggle-row" style="gap:8px;padding:4px 0;cursor:pointer">
            <input type="checkbox" class="rk-topic" data-topic="${t.id}"${topics.includes(t.id) ? ' checked' : ''}>
            <span class="ai-flow-toggle-label">${t.label}</span>
          </label>`).join('');

        contentEl.innerHTML = `
          <div class="ai-flow-section-label">Canali di consegna</div>
          <div class="us-notif-ch-row${tgConnected ? ' us-notif-ch-on' : ''}" data-channel-type="telegram">
            <div class="us-notif-ch-body">
              <div class="us-notif-ch-name">Telegram</div>
              <div class="us-notif-ch-sub">${tgConnected ? `Connesso (chat ${escapeHtml(String(tg!.chatId))})` : 'Non connesso'}</div>
            </div>
            <div class="us-notif-ch-actions">
              ${tgConnected
                ? `<span class="us-notif-ch-badge">Connected</span><button type="button" class="us-notif-ch-btn us-notif-disconnect rk-tg-remove">Rimuovi</button>`
                : `<input type="text" id="rkTgChatId" class="unified-settings-input" style="font-size:12px;width:150px" placeholder="Telegram chat ID" value="">`}
            </div>
          </div>
          ${tgConnected ? '' : `<div class="ai-flow-toggle-desc" style="margin:4px 0 8px 8px">Avvia una chat col bot di consegna e inserisci il chat ID (es. <code>getUpdates</code> del bot).</div>`}
          <div class="us-notif-ch-row${emailConnected ? ' us-notif-ch-on' : ''}" data-channel-type="email">
            <div class="us-notif-ch-body">
              <div class="us-notif-ch-name">Email</div>
              <div class="us-notif-ch-sub">${emailConnected ? escapeHtml(String(email!.to)) : 'Non connessa'}</div>
            </div>
            <div class="us-notif-ch-actions">
              ${emailConnected
                ? `<span class="us-notif-ch-badge">Connected</span><button type="button" class="us-notif-ch-btn us-notif-disconnect rk-email-remove">Rimuovi</button>`
                : `<input type="email" id="rkEmailTo" class="unified-settings-input" style="font-size:12px;width:170px" placeholder="destinatario@example.com" value="">`}
            </div>
          </div>

          <div class="ai-flow-section-label" style="margin-top:10px">Frequenza</div>
          <select class="unified-settings-select" id="rkFrequency">${freqOptions}</select>
          <div class="ai-flow-toggle-desc" style="margin-top:4px">La consegna è orchestrata dal workflow n8n (rispetta la frequenza scelta).</div>

          <div class="ai-flow-section-label" style="margin-top:10px">Argomenti</div>
          ${topicRows}

          <div class="ai-flow-section-label" style="margin-top:10px">Arricchimento</div>
          <select class="unified-settings-select" id="rkEnrichment">
            <option value="fact"${enrichment === 'fact' ? ' selected' : ''}>Fatti (solo segnali)</option>
            <option value="analysis"${enrichment === 'analysis' ? ' selected' : ''}>Analisi (segnali + contesto)</option>
            <option value="regulatory"${enrichment === 'regulatory' ? ' selected' : ''}>Regolatorio (segnali + normativa)</option>
          </select>

          <div class="ai-flow-section-label" style="margin-top:10px">Stato</div>
          <div class="ai-flow-toggle-desc" id="rkStatus">Salvataggio automatico attivo.</div>`;

        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';
      };

      const fail = (msg: string): void => {
        const loadingEl = container.querySelector<HTMLElement>('#rkNotifLoading');
        if (loadingEl) loadingEl.textContent = `Errore: ${msg}`;
      };

      const persist = (patch: Partial<NotifyConfig>): void => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const next: NotifyConfig = {
            frequency: current?.frequency ?? 'hourly',
            topics: current?.topics ?? [],
            enrichment: current?.enrichment ?? 'fact',
            ...patch,
            endpoints: {
              telegram: { ...(current?.endpoints?.telegram ?? { enabled: false }), ...(patch.endpoints?.telegram ?? {}) },
              email: { ...(current?.endpoints?.email ?? { enabled: false }), ...(patch.endpoints?.email ?? {}) },
            },
          };
          void saveConfig(next)
            .then(() => {
              current = next;
              const statusEl = container.querySelector<HTMLElement>('#rkStatus');
              if (statusEl) statusEl.textContent = 'Configurazione salvata.';
            })
            .catch((err: Error) => {
              const statusEl = container.querySelector<HTMLElement>('#rkStatus');
              if (statusEl) statusEl.textContent = `Salvataggio fallito: ${err.message}`;
            });
        }, 700);
      };

      loadConfig(signal)
        .then((config) => {
          if (signal.aborted) return;
          current = config;
          render(config);
        })
        .catch((err: Error) => {
          if (!signal.aborted) fail(err.message);
        });

      container.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'rkFrequency') {
          persist({ frequency: (target.value ?? 'hourly') as NotifyConfig['frequency'] });
          return;
        }
        if (target.id === 'rkEnrichment') {
          persist({ enrichment: (target.value ?? 'fact') as NotifyConfig['enrichment'] });
          return;
        }
        if (target.classList.contains('rk-topic')) {
          const checked = Array.from(container.querySelectorAll<HTMLInputElement>('.rk-topic'))
            .filter((el) => el.checked)
            .map((el) => el.dataset.topic ?? '');
          persist({ topics: checked });
        }
      }, { signal });

      container.addEventListener('keydown', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.id === 'rkTgChatId' && e.key === 'Enter') {
          const chatId = target.value.trim();
          if (!chatId) return;
          persist({ endpoints: { telegram: { enabled: true, chatId } } });
          render({ ...(current ?? {}), endpoints: { ...(current?.endpoints ?? {}), telegram: { enabled: true, chatId } } });
          return;
        }
        if (target.id === 'rkEmailTo' && e.key === 'Enter') {
          const to = target.value.trim();
          if (!to) return;
          persist({ endpoints: { email: { enabled: true, to } } });
          render({ ...(current ?? {}), endpoints: { ...(current?.endpoints ?? {}), email: { enabled: true, to } } });
        }
      }, { signal });

      container.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.rk-tg-remove')) {
          persist({ endpoints: { telegram: { enabled: false } } });
          render({ ...(current ?? {}), endpoints: { ...(current?.endpoints ?? {}), telegram: { enabled: false } } });
          return;
        }
        if (target.closest('.rk-email-remove')) {
          persist({ endpoints: { email: { enabled: false } } });
          render({ ...(current ?? {}), endpoints: { ...(current?.endpoints ?? {}), email: { enabled: false } } });
        }
      }, { signal });

      signal.addEventListener('abort', () => {
        if (saveTimer) clearTimeout(saveTimer);
      });

      return () => ac.abort();
    },
  };
}
