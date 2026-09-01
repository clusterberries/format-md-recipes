export function normalizeHtml(html: string): string {
  return html
    .replace(/>\s+</g, '><')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
