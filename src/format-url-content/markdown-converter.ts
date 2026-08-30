import TurndownService from 'turndown';
import { tables } from '@truto/turndown-plugin-gfm';
import type { RecipeImage } from './images-parser/types.ts';

export type MarkdownImagePosition = 'top' | 'bottom';

export type HtmlToMarkdownOptions = {
  mainImage?: RecipeImage | null;
  imagePosition?: MarkdownImagePosition;
  imageAlt?: string;
  keepLinks?: boolean;
};

export function convertRecipeHtmlToMarkdown(
  html: string,
  options: HtmlToMarkdownOptions = {},
): string {
  const {
    mainImage,
    imagePosition = 'top',
    imageAlt = 'Recipe image',
    keepLinks = false,
  } = options;

  if (!html.trim() && !mainImage?.url) {
    return '';
  }

  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });

  turndown.use(tables);

  // Remove all images from the HTML.
  // The selected main image is added separately after conversion.
  turndown.addRule('ignoreImages', {
    filter: ['img', 'picture', 'source'],
    replacement: () => '',
  });

  // Prevent script/style/embed content from leaking into the output markdown.
  turndown.addRule('ignoreNonContentElements', {
    filter: ['script', 'style', 'noscript', 'iframe'],
    replacement: () => '',
  });

  // Convert links to plain text unless link preservation is explicitly enabled.
  turndown.addRule('recipeLinks', {
    filter: 'a',
    replacement: (content, node) => {
      if (!keepLinks) {
        return content;
      }

      const href = node.getAttribute('href')?.trim();

      if (!href || href.startsWith('#')) {
        return content;
      }

      return `[${content}](${href})`;
    },
  });

  // Normalize line breaks from HTML.
  turndown.addRule('lineBreaks', {
    filter: 'br',
    replacement: () => '\n',
  });

  let markdown = html.trim() ? turndown.turndown(html) : '';

  markdown = normalizeMarkdown(markdown);

  if (!mainImage?.url) {
    return markdown;
  }

  const imageMarkdown = createMarkdownImage(
    mainImage.url,
    mainImage.alt || imageAlt,
  );

  if (imagePosition === 'bottom') {
    return joinMarkdown(markdown, imageMarkdown);
  }

  return joinMarkdown(imageMarkdown, markdown);
}

function createMarkdownImage(url: string, alt: string): string {
  const safeAlt = normalizeAltText(alt);

  return `![${safeAlt}](${url})`;
}

function joinMarkdown(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^\s*[-*+]\s*$/gm, '')
    .replace(/^\s*\d+\.\s*$/gm, '')
    .replace(/^#{1,6}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeAltText(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();
}
