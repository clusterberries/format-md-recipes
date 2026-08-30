export function logWarning(message: string) {
  const yellow = '\u001b[33m';
  const reset = '\u001b[0m';
  console.warn(`⚠️  ${yellow}Warning:${reset} ${message}`);
}

export function logInfo(message: string) {
  const blue = '\u001b[34m';
  const reset = '\u001b[0m';
  console.log(`ℹ️  ${blue}${message}${reset}`);
}

export function logSuccess(message: string) {
  const green = '\u001b[32m';
  const reset = '\u001b[0m';
  console.log(`✅ ${green}${message}${reset}`);
}
