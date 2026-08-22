import type { Cheerio, CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import {
  CLEANUP_PASSES,
  REMOVABLE_EMPTY_SELECTOR,
} from './constants.ts';
import { normalizeText } from './utils.ts';
import { shouldProtectRecipeElement } from './noise-remover.ts';

const RETAINED_MEDIA_SELECTOR = 'img, picture, video, audio, source';
const MEANINGFUL_CHILD_SELECTOR =
  'h1, h2, h3, h4, h5, h6, p, li, table, blockquote, pre';

export function removeEmptyElements(
  $: CheerioAPI,
  root: Cheerio<Element>,
): void {
  // Multiple passes are needed because removing children can empty their parent.
  for (let pass = 0; pass < CLEANUP_PASSES; pass++) {
    let removedCount = 0;

    root.find(REMOVABLE_EMPTY_SELECTOR).each((_, el) => {
      const $element = $(el);

      if (shouldProtectRecipeElement($, $element)) {
        return;
      }

      const hasText = normalizeText($element.text()).length > 0;
      // Media is intentionally retained for a later image-processing step.
      const hasMedia = $element.find(RETAINED_MEDIA_SELECTOR).length > 0;
      const hasMeaningfulChildren =
        $element.children(MEANINGFUL_CHILD_SELECTOR).length > 0;

      if (!hasText && !hasMedia && !hasMeaningfulChildren) {
        $element.remove();
        removedCount++;
      }
    });

    if (removedCount === 0) {
      break;
    }
  }
}