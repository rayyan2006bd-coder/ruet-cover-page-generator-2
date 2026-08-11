import { metaResponseSchema } from '@shared/api-contracts';
import { apiRequest } from './client';

export function getApiMetadata(signal?: AbortSignal) {
  return apiRequest('/api/v1/meta', metaResponseSchema, { signal });
}
