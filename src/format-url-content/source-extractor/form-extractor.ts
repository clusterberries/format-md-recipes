import type * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { FormRecipeValue } from '../types.ts';
import { escapeCssSelectorValue } from '../utils.ts';
import { getFingerprint } from './extraction-helpers.ts';

const FORM_SIGNAL_PATTERN =
  /\b(recipe|ingredient|quantity|amount|unit|serving|рецепт|ингредиент|количеств|единиц|порци)/i;

export function extractRecipeFormValues(
  $: cheerio.CheerioAPI,
): FormRecipeValue[] {
  const values: FormRecipeValue[] = [];

  $('form, [role="form"], [class*="recipe" i], [id*="recipe" i]').each(
    (_, container) => {
      const $container = $(container);
      const context = getFingerprint($, container) + ' ' + $container.text();

      if (!FORM_SIGNAL_PATTERN.test(context)) return;

      $container.find('input, textarea, select, output').each((_, control) => {
        const $control = $(control);
        const value =
          $control.attr('value')?.trim() ||
          $control.find('option:selected').text().trim() ||
          $control.text().trim();

        if (!value) return;

        const id = $control.attr('id');
        const label = id
          ? getLabelForId($container, id)
          : $control.closest('label').text().trim();

        values.push({
          location: 'recipe-form',
          label: label || null,
          name: $control.attr('name')?.trim() || null,
          value,
        });
      });
    },
  );

  return deduplicateFormValues(values);
}

function getLabelForId(
  $container: cheerio.Cheerio<Element>,
  id: string,
): string {
  try {
    return $container
      .find(`label[for="${escapeCssSelectorValue(id)}"]`)
      .first()
      .text()
      .trim();
  } catch {
    // Malformed id from page content; fall back to no label.
    return '';
  }
}

function deduplicateFormValues(values: FormRecipeValue[]): FormRecipeValue[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.label ?? ''}:${value.name ?? ''}:${value.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
