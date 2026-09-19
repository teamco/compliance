const KNOWN_ERROR_KEYS: Record<string, string> = {
  assignee_not_active_member: 'error.assigneeNotActiveMember',
};

/**
 * Maps a known API error code (thrown as `err.message` by BadRequestException
 * on the gateway) to its translated message; falls back to a generic message
 * for anything unrecognized.
 */
export function getApiErrorMessage(err: unknown, t: (key: string) => string): string {
  const code = err instanceof Error ? err.message : undefined;
  const key = code ? KNOWN_ERROR_KEYS[code] : undefined;
  return t(key ?? 'error.unknown');
}
