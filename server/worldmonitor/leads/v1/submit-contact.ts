/**
 * RPC: submitContact (stub for academic version).
 */

import type {
  ServerContext,
  SubmitContactRequest,
  SubmitContactResponse,
} from '../../../../src/generated/server/worldmonitor/leads/v1/service_server';

export async function submitContact(
  _ctx: ServerContext,
  _req: SubmitContactRequest,
): Promise<SubmitContactResponse> {
  return { status: 'sent', emailSent: false };
}
