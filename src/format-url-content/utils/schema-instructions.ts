import type { RecipeSchema } from '../images-parser/types.ts';
import { MAX_SCHEMA_RECURSION_DEPTH } from './dom-helpers.ts';

/** One traversal keeps instruction text and image step indexes aligned. */
export function flattenSchemaInstructions(
  value: unknown,
  depth = 0,
): RecipeSchema[] {
  if (depth > MAX_SCHEMA_RECURSION_DEPTH || !value) return [];
  if (typeof value === 'string') return [{ text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenSchemaInstructions(item, depth + 1));
  }
  if (typeof value !== 'object') return [];

  const item = value as RecipeSchema;
  const children =
    item.itemListElement ??
    item.steps ??
    item.recipeInstructions ??
    item.itemList;
  if (children !== undefined)
    return flattenSchemaInstructions(children, depth + 1);
  return typeof item.text === 'string' || item.image !== undefined
    ? [item]
    : [];
}
