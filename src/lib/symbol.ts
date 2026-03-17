export function generateSymbol(input: string): string {
  return input
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}
