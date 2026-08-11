import { departmentSchema } from '@shared/api-contracts';
import { z } from 'zod';
import { apiRequest } from './client';

export function getDepartments(signal?: AbortSignal) {
  return apiRequest('/api/v1/departments', z.array(departmentSchema), {
    signal,
  });
}
