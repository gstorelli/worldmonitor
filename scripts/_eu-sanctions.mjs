// EU Financial Sanctions Files (consolidated list), aggregated for the
// Sanctions pressure panel (thesis issue #92). Only counts leave this module:
// the list names natural persons, and no name, birth date or identifier is
// stored or published (CLAUDE.md, rule 5: no personal data).

export const EU_SANCTIONS_KEY = 'sanctions:eu:v1';
export const FSF_XML_URL = 'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';
export const RECENT_DAYS = 30;

/**
 * Streaming extraction of the aggregate fields of each sanctionEntity, from
 * sax open/close tag events. Returns { onOpen, onClose, records }.
 * A record: { programme, firstPublished, subjectType, country }.
 */
export function createFsfCollector() {
  const records = [];
  let cur = null;
  return {
    records,
    onOpen(name, attrs) {
      const tag = name.includes(':') ? name.split(':').pop() : name;
      if (tag === 'sanctionEntity') {
        cur = { programmes: new Set(), dates: [], subjectType: null, addressCountry: null, citizenship: null };
      } else if (cur && tag === 'regulation') {
        if (attrs.programme) cur.programmes.add(String(attrs.programme));
        if (attrs.publicationDate) cur.dates.push(String(attrs.publicationDate).slice(0, 10));
      } else if (cur && tag === 'subjectType') {
        cur.subjectType = attrs.code ? String(attrs.code) : cur.subjectType;
      } else if (cur && tag === 'address' && !cur.addressCountry && attrs.countryIso2Code && attrs.countryIso2Code !== '00') {
        cur.addressCountry = String(attrs.countryIso2Code);
      } else if (cur && tag === 'citizenship' && !cur.citizenship && attrs.countryIso2Code && attrs.countryIso2Code !== '00') {
        cur.citizenship = String(attrs.countryIso2Code);
      }
    },
    onClose(name) {
      const tag = name.includes(':') ? name.split(':').pop() : name;
      if (tag !== 'sanctionEntity' || !cur) return;
      const dates = cur.dates.filter(Boolean).sort();
      records.push({
        programme: [...cur.programmes][0] ?? 'n.d.',
        firstPublished: dates[0] ?? null,
        subjectType: cur.subjectType ?? 'n.d.',
        // Enterprises: address country; persons: citizenship.
        country: cur.subjectType === 'enterprise' ? cur.addressCountry ?? cur.citizenship : cur.citizenship ?? cur.addressCountry,
      });
      cur = null;
    },
  };
}

/** Counts by regime, by country (enterprises only) and recent designations. */
export function aggregateFsf(records, { now = new Date(), generationDate = null } = {}) {
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const byProgramme = new Map();
  const byCountry = new Map();
  let persons = 0;
  let enterprises = 0;
  let recent = 0;
  let lastDesignation = null;
  for (const r of records) {
    if (r.firstPublished && (!lastDesignation || r.firstPublished > lastDesignation)) lastDesignation = r.firstPublished;
    if (r.subjectType === 'person') persons++;
    else if (r.subjectType === 'enterprise') enterprises++;
    const isRecent = r.firstPublished !== null && r.firstPublished >= since;
    if (isRecent) recent++;
    const p = byProgramme.get(r.programme) ?? { programme: r.programme, total: 0, recent: 0, persons: 0, enterprises: 0 };
    p.total++;
    if (isRecent) p.recent++;
    if (r.subjectType === 'person') p.persons++;
    if (r.subjectType === 'enterprise') p.enterprises++;
    byProgramme.set(r.programme, p);
    if (r.subjectType === 'enterprise' && r.country) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + 1);
  }
  return {
    generationDate,
    recentDays: RECENT_DAYS,
    since,
    total: records.length,
    persons,
    enterprises,
    recent,
    lastDesignation,
    programmes: [...byProgramme.values()].sort((a, b) => b.recent - a.recent || b.total - a.total),
    enterpriseCountries: [...byCountry.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count).slice(0, 15),
  };
}
