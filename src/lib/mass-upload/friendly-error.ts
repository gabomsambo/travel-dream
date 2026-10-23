/**
 * Turn a stored `sources.processing_error` into one plain sentence for the UI.
 * Shared by the Mass Upload status route and the Inbox uploads summary, so the
 * same screenshot never reads two different ways.
 */
export function toUserFriendlyError(rawError: string): string {
  if (/503|overloaded|high demand/i.test(rawError)) return 'AI service was unavailable after multiple attempts';
  if (/429|rate.?limit|quota/i.test(rawError)) return 'Rate limit exceeded after multiple attempts';
  if (/400|invalid|INVALID_ARGUMENT/i.test(rawError)) return 'Could not process this image';
  if (/fetch failed|network|ECONNRESET|ENOTFOUND/i.test(rawError)) return 'Network error during processing';
  if (/not found|404/i.test(rawError)) return 'Image file not found';
  if (/timed out|timeout/i.test(rawError)) return 'Processing timed out after multiple attempts';
  return 'Processing failed after multiple attempts';
}
