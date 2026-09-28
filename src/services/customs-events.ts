import { toApiUrl } from './runtime';

export interface CustomsEvent {
  id: string;
  title: string;
  description: string;
  explainability?: string;
  score: number;
  lat: number;
  lon: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  timestamp: number;
}

export async function fetchCustomsEvents(): Promise<CustomsEvent[]> {
  try {
    const url = toApiUrl('/api/customs-events');
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[CustomsEvents] HTTP ${response.status}`);
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('[CustomsEvents] Fetch error:', error);
    return [];
  }
}

const SEVERITY_SCORES: Record<string, number> = {
  critical: 0.95,
  extreme: 0.95,
  high: 0.85,
  elevated: 0.8,
  moderate: 0.6,
  low: 0.4,
  normal: 0.3,
};

/**
 * Fallback feed for the Global Risk Alerts panel: the n8n digest
 * (risk_sentinel:n8n:* + policy monitor) reshaped as alert cards. The SQLite
 * customs-events table has no writer in the self-hosted deploy, so without
 * this the panel stays empty while the pipelines are producing signals.
 */
export async function fetchDigestSignals(limit = 12): Promise<CustomsEvent[]> {
  try {
    const url = toApiUrl(`/api/notify/digest?limit=${limit}`);
    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`[DigestSignals] HTTP ${response.status}`);
      return [];
    }

    const payload = await response.json();
    const sections: Array<{ topic?: string; title?: string; items?: Array<Record<string, unknown>> }> =
      Array.isArray(payload?.digest?.sections) ? payload.digest.sections : [];

    return sections
      .flatMap(section =>
        (section.items ?? []).map((item, index) => {
          const severity = String(item.severity ?? 'moderate').toLowerCase();
          const rawScore = Number(item.score ?? 0);
          const score = rawScore > 0 ? Math.min(rawScore, 1) : (SEVERITY_SCORES[severity] ?? 0.5);
          const level: CustomsEvent['severity'] =
            severity === 'critical' || severity === 'extreme' ? 'critical'
              : severity === 'high' || severity === 'elevated' ? 'high'
                : severity === 'low' || severity === 'normal' ? 'low'
                  : 'medium';
          return {
            id: `digest-${section.topic ?? 'topic'}-${index}`,
            title: String(item.title ?? 'Signal'),
            description: String(item.summary ?? ''),
            explainability: `Fonte: ${item.source ?? section.topic ?? 'n8n'} · severità ${severity}${item.url ? ` · ${item.url}` : ''}`,
            score,
            lat: 0,
            lon: 0,
            severity: level,
            timestamp: Date.now(),
          } satisfies CustomsEvent;
        }),
      )
      .slice(0, limit);
  } catch (error) {
    console.error('[DigestSignals] Fetch error:', error);
    return [];
  }
}
