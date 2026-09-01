import * as cheerio from 'cheerio';
import {
  extractSchemaMainImages,
  extractSchemaStepImages,
} from './extract-schema-images.ts';
import { extractHtmlImages } from './html-images/index.ts';
import { buildRecipeImagesResult } from './build-images-result.ts';
import type { ExtractRecipeImagesResult, RecipeSchema } from './types.ts';

export function extractRecipeImages(
  content: string,
  pageUrl: string,
  schema: RecipeSchema,
): ExtractRecipeImagesResult {
  const $ = cheerio.load(content);
  return buildRecipeImagesResult(
    extractSchemaMainImages(schema, pageUrl),
    extractSchemaStepImages(schema, pageUrl),
    extractHtmlImages($, pageUrl),
  );
}
