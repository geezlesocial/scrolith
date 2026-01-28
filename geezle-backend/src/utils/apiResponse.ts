export function ok(data: any, meta?: any) {
  return { success: true, data, meta };
}

export function fail(message: string, code = 'BAD_REQUEST', details?: any) {
  return { success: false, error: { message, code, details } };
}
