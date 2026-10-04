import { RECIPE_TAGS } from '../../shared/recipe-prompt-parts.ts';

export type FormattedNoteResult = { markdown: string } | { issue: string };

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;
const IMAGE_TARGET_PATTERN = /!\[[^\]]*\]\(([^)]*)\)/g;
const REQUIRED_HEADINGS = ['## Ингредиенты', '## Приготовление'];
const ALLOWED_TAGS: ReadonlySet<string> = new Set(RECIPE_TAGS);

export function validateFormattedNote(
  rawOutput: string,
  originalMarkdown: string,
): FormattedNoteResult {
  const output = stripCodeFence(rawOutput.replace(/\r\n?/g, '\n')).trim();
  if (!output) return { issue: 'empty response' };

  const frontmatterMatch = FRONTMATTER_PATTERN.exec(output);
  if (!frontmatterMatch) return { issue: 'missing frontmatter' };

  const frontmatter = frontmatterMatch[1] ?? '';
  const ingredients = unique(readYamlList(frontmatter, 'ингредиенты'));
  if (!ingredients.length)
    return { issue: 'missing ingredients in frontmatter' };
  const tags = unique(['рецепты', ...readYamlList(frontmatter, 'tags')]).filter(
    (tag) => ALLOWED_TAGS.has(tag),
  );

  const body = output.slice(frontmatterMatch[0].length).trim();
  const missingHeading = REQUIRED_HEADINGS.find(
    (heading) => !new RegExp(`^${heading}[ \\t]*$`, 'm').test(body),
  );
  if (missingHeading) return { issue: `missing section "${missingHeading}"` };

  const keptImages = new Set(getImageTargets(body));
  const lostImage = getImageTargets(originalMarkdown).find(
    (target) => !keptImages.has(target),
  );
  if (lostImage) return { issue: `image was lost: ${lostImage}` };

  return {
    markdown: `---\ntags:\n${toYamlItems(tags)}\nингредиенты:\n${toYamlItems(ingredients)}\n---\n\n${body}`,
  };
}

function stripCodeFence(text: string): string {
  const match = /^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/.exec(text);
  return match?.[1] ?? text;
}

function readYamlList(frontmatter: string, key: string): string[] {
  const items: string[] = [];
  let inList = false;
  for (const line of frontmatter.split('\n')) {
    if (/^\S/.test(line)) {
      inList = line.trim() === `${key}:`;
      continue;
    }
    const item = inList ? /^\s*-\s+(.+?)\s*$/.exec(line)?.[1] : undefined;
    if (item) items.push(item.replace(/^(["'])(.*)\1$/, '$2'));
  }
  return items;
}

function toYamlItems(items: string[]): string {
  return items
    .map((item) =>
      /^[\p{L}\p{N}][\p{L}\p{N} _.,()%/-]*$/u.test(item)
        ? `  - ${item}`
        : `  - ${JSON.stringify(item)}`,
    )
    .join('\n');
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function getImageTargets(markdown: string): string[] {
  return Array.from(markdown.matchAll(IMAGE_TARGET_PATTERN), (match) =>
    (match[1] ?? '').trim(),
  );
}
