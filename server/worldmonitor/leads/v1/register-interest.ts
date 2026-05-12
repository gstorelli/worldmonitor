/**
 * RPC: registerInterest (stub for academic version).
 */

import type {
  ServerContext,
  RegisterInterestRequest,
  RegisterInterestResponse,
} from '../../../../src/generated/server/worldmonitor/leads/v1/service_server';

export async function registerInterest(
  _ctx: ServerContext,
  _req: RegisterInterestRequest,
): Promise<RegisterInterestResponse> {
  return {
    status: 'registered',
    referralCode: '',
    referralCount: 0,
    position: 0,
    emailSuppressed: false,
  };
}
