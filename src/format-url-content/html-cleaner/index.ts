import * as cheerio from 'cheerio';
import { findMainContentRoot } from './find-content-root.ts';
import { removeEmptyElements } from './empty-element-remover.ts';
import {
  removeGlobalNoise,
  removeHtmlComments,
  removeNamedNoise,
  removeNoiseByText,
} from './noise-remover.ts';
import { HARD_REMOVE_SELECTOR } from './constants.ts';
import { normalizeHtml } from './utils.ts';
import type { CleanupMode } from './types.ts';

/**
 * Selects the likely main content, removes technical and non-recipe noise,
 * and preserves images without normalizing them.
 */
export function cleanRecipeContent(
  content: string,
  cleanupMode: CleanupMode = 'minimal',
): string {
  if (!content.trim()) {
    return '';
  }

  const $ = cheerio.load(content);

  $(HARD_REMOVE_SELECTOR).remove();

  const root = findMainContentRoot($);

  removeHtmlComments(root);
  removeGlobalNoise(root);
  removeNamedNoise($, root, cleanupMode);
  removeNoiseByText($, root, cleanupMode);
  removeEmptyElements($, root);

  return normalizeHtml(root.contents().toString());
}
