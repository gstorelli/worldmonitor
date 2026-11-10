import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, switcherApps } from '../src/config/apps.ts';

describe('header app switcher', () => {
  it('hides the full dashboard unless it is the open app', () => {
    assert.deepEqual(switcherApps('thesis').map((a) => a.id), ['thesis', 'osint', 'research', 'policy']);
    assert.ok(switcherApps('customs').some((a) => a.id === 'customs'));
  });

  it('keeps the full dashboard registered (reachable by ?app=customs)', () => {
    assert.ok(APPS.some((a) => a.id === 'customs'));
  });
});
