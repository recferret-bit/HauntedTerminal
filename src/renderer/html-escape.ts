const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);
}
