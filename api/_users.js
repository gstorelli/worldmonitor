/**
 * Risk Sentinel — user store + password hashing.
 *
 * Users live in a single Redis JSON document (`rs:users`, keyed by lowercased
 * username). The user base is tiny (researchers/admins), so a read-modify-write
 * document is simpler than a hash type and the write races are negligible.
 *
 * Passwords are PBKDF2-SHA256 (Web Crypto: works on Edge and Node without
 * native deps). Never call this module's `passwordHash` field from a response —
 * always map through `publicUser()`.
 */

import { constantTimeEqual, getSessionFromRequest } from './_user-session.js';
import { redisGetJson, redisSetJson } from './_redis.js';

export const USERS_KEY = 'rs:users';
export const ROLES = ['admin', 'user'];
const PBKDF2_ITERATIONS = 210_000;

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizeUsername(username) {
  return String(username ?? '').trim().toLowerCase();
}

export function isValidUsername(username) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalizeUsername(username));
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 200;
}

async function pbkdf2(password, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterationsRaw, saltRaw, hashRaw] = String(stored ?? '').split('$');
  if (scheme !== 'pbkdf2' || !iterationsRaw || !saltRaw || !hashRaw) return false;
  const iterations = Number(iterationsRaw);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  const derived = await pbkdf2(password, fromBase64Url(saltRaw), iterations);
  return constantTimeEqual(toBase64Url(derived), hashRaw);
}

export async function loadUsers() {
  const raw = await redisGetJson(USERS_KEY);
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

async function saveUsers(users) {
  await redisSetJson(USERS_KEY, users);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function newUserId() {
  return `u_${toBase64Url(crypto.getRandomValues(new Uint8Array(9)))}`;
}

export async function getUserByUsername(username) {
  const users = await loadUsers();
  return users[normalizeUsername(username)] ?? null;
}

export async function getUserById(id) {
  const users = await loadUsers();
  return Object.values(users).find((user) => user.id === id) ?? null;
}

/** Session cookie → user record, or null when absent/invalid/secret missing. */
export async function getRequestUser(request) {
  const secret = process.env.WM_SESSION_SECRET || '';
  if (!secret) return null;
  const session = await getSessionFromRequest(request, secret);
  if (!session) return null;
  return getUserById(session.sub);
}

export async function createUser({ username, password, role = 'user' }) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) throw new Error('invalid username');
  if (!isValidPassword(password)) throw new Error('password must be 8-200 characters');
  if (!ROLES.includes(role)) throw new Error(`role must be one of: ${ROLES.join(', ')}`);

  const users = await loadUsers();
  if (users[normalized]) throw new Error('username already exists');
  const now = new Date().toISOString();
  const user = {
    id: newUserId(),
    username: normalized,
    role,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  };
  users[normalized] = user;
  await saveUsers(users);
  return publicUser(user);
}

export async function updateUser(username, patch = {}) {
  const normalized = normalizeUsername(username);
  const users = await loadUsers();
  const user = users[normalized];
  if (!user) throw new Error('user not found');
  if (patch.password !== undefined) {
    if (!isValidPassword(patch.password)) throw new Error('password must be 8-200 characters');
    user.passwordHash = await hashPassword(patch.password);
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) throw new Error(`role must be one of: ${ROLES.join(', ')}`);
    user.role = patch.role;
  }
  user.updatedAt = new Date().toISOString();
  users[normalized] = user;
  await saveUsers(users);
  return publicUser(user);
}

export async function deleteUser(username) {
  const normalized = normalizeUsername(username);
  const users = await loadUsers();
  if (!users[normalized]) throw new Error('user not found');
  delete users[normalized];
  await saveUsers(users);
}

export async function listUsers() {
  const users = await loadUsers();
  return Object.values(users).map(publicUser).sort((a, b) => a.username.localeCompare(b.username));
}
