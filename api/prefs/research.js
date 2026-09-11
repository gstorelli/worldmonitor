import { getPublicCorsHeaders } from '../_cors.js';
import { getRequestUser } from '../_users.js';
import { redisGetJson, redisSetJson } from '../_redis.js';

/**
 * Per-user research state for the Research application.
 *
 *   GET /api/prefs/research → { research }
 *   PUT /api/prefs/research → authenticated; { research }
 *
 * Shape (all keys optional, stored at `rs:user:<id>:research`):
 *   notes:      { [ref]: string }                        reading notes
 *   reading:    { [ref]: { state, priority, tags[] } }   review workflow
 *   overrides:  { [ref]: { doi?, venue?, year?, url? } } Crossref enrichment
 *   imported:   ResearchSource[]                         BibTeX/RIS imports
 */

const MAX_BYTES = 800_000;
const MAX_NOTE_LENGTH = 20_000;
const STATES = ['to-read', 'reading', 'reviewed'];
const PRIORITIES = ['low', 'medium', 'high'];
const MAX_IMPORTED = 300;

class ValidationError extends Error {}

function researchKey(userId) {
  return `rs:user:${userId}:research`;
}

function validateNotes(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('notes must be an object');
  for (const [ref, note] of Object.entries(value)) {
    if (!/^\d+$/.test(ref)) throw new ValidationError(`invalid note ref: ${ref}`);
    if (typeof note !== 'string') throw new ValidationError(`note ${ref} must be a string`);
    if (note.length > MAX_NOTE_LENGTH) throw new ValidationError(`note ${ref} is too long`);
  }
  return value;
}

function validateReading(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('reading must be an object');
  for (const [ref, entry] of Object.entries(value)) {
    if (!/^\d+$/.test(ref)) throw new ValidationError(`invalid reading ref: ${ref}`);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ValidationError(`reading ${ref} must be an object`);
    if (entry.state !== undefined && !STATES.includes(entry.state)) throw new ValidationError(`invalid state for ${ref}`);
    if (entry.priority !== undefined && !PRIORITIES.includes(entry.priority)) throw new ValidationError(`invalid priority for ${ref}`);
    if (entry.tags !== undefined) {
      if (!Array.isArray(entry.tags) || entry.tags.length > 12) throw new ValidationError(`invalid tags for ${ref}`);
      for (const tag of entry.tags) {
        if (typeof tag !== 'string' || !tag.trim() || tag.length > 40) throw new ValidationError(`invalid tag for ${ref}`);
      }
    }
  }
  return value;
}

function validateOverrides(value) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('overrides must be an object');
  for (const [ref, override] of Object.entries(value)) {
    if (!/^\d+$/.test(ref)) throw new ValidationError(`invalid override ref: ${ref}`);
    if (!override || typeof override !== 'object' || Array.isArray(override)) throw new ValidationError(`override ${ref} must be an object`);
    if (override.year !== undefined && !Number.isInteger(override.year)) throw new ValidationError(`invalid year for ${ref}`);
    for (const field of ['doi', 'venue', 'url']) {
      if (override[field] !== undefined && typeof override[field] !== 'string') throw new ValidationError(`invalid ${field} for ${ref}`);
    }
  }
  return value;
}

function validateImported(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ValidationError('imported must be an array');
  if (value.length > MAX_IMPORTED) throw new ValidationError(`at most ${MAX_IMPORTED} imported sources`);
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new ValidationError('imported entries must be objects');
    if (!Number.isInteger(entry.ref) || entry.ref <= 0) throw new ValidationError('imported entries need a positive integer ref');
    if (typeof entry.title !== 'string' || !entry.title.trim()) throw new ValidationError('imported entries need a title');
  }
  return value;
}

function validateResearch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError('research must be an object');
  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_BYTES) throw new ValidationError('research payload is too large');
  return {
    notes: validateNotes(value.notes),
    reading: validateReading(value.reading),
    overrides: validateOverrides(value.overrides),
    imported: validateImported(value.imported),
  };
}

export default async function handler(request) {
  const corsHeaders = getPublicCorsHeaders('GET, PUT, OPTIONS');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  let user = null;
  try {
    user = await getRequestUser(request);
  } catch {
    return json({ error: 'User store unavailable' }, 503);
  }

  if (request.method === 'GET') {
    if (!user) return json({ research: null });
    try {
      const research = await redisGetJson(researchKey(user.id));
      return json({ research: research && typeof research === 'object' ? research : null });
    } catch {
      return json({ research: null });
    }
  }

  if (request.method === 'PUT') {
    if (!user) return json({ error: 'Unauthorized' }, 401);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    let research;
    try {
      research = validateResearch(body?.research);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'invalid body' }, 400);
    }
    try {
      await redisSetJson(researchKey(user.id), research);
    } catch {
      return json({ error: 'Failed to persist research state' }, 503);
    }
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
