export function logWarning(message: string) {
  const yellow = '\u001b[33m';
  const reset = '\u001b[0m';
  console.warn(`⚠️  ${yellow}Warning:${reset} ${message}`);
}