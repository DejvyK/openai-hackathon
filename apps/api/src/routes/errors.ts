import { ApiErrorSchema, type ApiError } from '@agentlayer/contracts/v1';

export function apiError(code: string, message: string, status: number, operation: ApiError['operation'] = null, retryable = false, requestId: string | null = null) {
  return Response.json(ApiErrorSchema.parse({ code, message, retryable, requestId, operation }), { status });
}
