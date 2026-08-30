// Escapes a value for safe use inside a CSS attribute/id selector (CSS.escape-equivalent).
export function escapeCssSelectorValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}
