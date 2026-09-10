#!/usr/bin/env node
/**
 * Risk Sentinel — create/update a user in Redis (`rs:users`).
 *
 * Run on the VPS through the compose network (see scripts/create-user.sh):
 *   ./scripts/create-user.sh --username admin --role admin --password '...'
 *
 * Prefer the environment form to keep the password out of shell history:
 *   RS_USER_PASSWORD='...' ./scripts/create-user.sh --username admin --role admin
 *
 * Requires UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (the wrapper
 * injects them from the compose network + .env).
 */

import { createUser, getUserByUsername, updateUser } from '../api/_users.js';

function usage() {
  console.error(`usage: node scripts/create-user.mjs --username <name> [--role admin|user] [--password <pw>] [--update]
  password may also be provided via RS_USER_PASSWORD`);
}

const argv = process.argv.slice(2);
const opts = {};
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  if (key === 'update') {
    opts.update = true;
    continue;
  }
  opts[key] = argv[i + 1];
  i += 1;
}

const username = opts.username;
const password = opts.password || process.env.RS_USER_PASSWORD;
const role = opts.role || 'user';

if (!username || !password) {
  usage();
  process.exit(1);
}

try {
  const existing = await getUserByUsername(username);
  if (existing && !opts.update) {
    console.error(`error: user "${username}" already exists (pass --update to reset the password/role)`);
    process.exit(2);
  }
  const user = existing
    ? await updateUser(username, { password, role })
    : await createUser({ username, password, role });
  console.log(`ok: ${user.username} (${user.role}) ${existing ? 'updated' : 'created'}`);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
