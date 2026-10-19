// Matches `![alt](target)`; groups: prefix, target, suffix.
export const IMAGE_PATTERN = /(!\[[^\]]*\]\()([^)]*)(\))/g;

/** Swaps image targets for short ids so the model cannot rewrite long, percent-encoded paths. */
export function maskImageTargets(markdown: string) {
  const placeholders = new Map<string, string>();
  const targets = new Map<string, string>();
  const masked = markdown.replace(
    IMAGE_PATTERN,
    (_match, prefix: string, target: string, suffix: string) => {
      const key = target.trim();
      let placeholder = placeholders.get(key);
      if (!placeholder) {
        placeholder = `image-${placeholders.size + 1}`;
        placeholders.set(key, placeholder);
        targets.set(placeholder, key);
      }
      return `${prefix}${placeholder}${suffix}`;
    },
  );
  const restore = (note: string) =>
    note.replace(
      IMAGE_PATTERN,
      (match, prefix: string, target: string, suffix: string) => {
        const original = targets.get(target.trim());
        return original ? `${prefix}${original}${suffix}` : match;
      },
    );
  return { masked, restore };
}
