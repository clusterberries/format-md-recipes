import * as cheerio from 'cheerio';
import {
  extractSchemaMainImages,
  extractSchemaStepImages,
} from '../images-parser/extract-schema-images.ts';
import { extractHtmlImages } from '../images-parser/html-images/index.ts';
import { buildRecipeImagesResult } from '../images-parser/build-images-result.ts';
import { detectRecipeCandidates } from '../candidate-detector/index.ts';
import type {
  ExtractedPageSources,
  PageMetadata,
  ParsedArticle,
} from '../types.ts';
import type { RecipeImage } from '../images-parser/types.ts';
import { extractJsonLdRecipes } from './json-ld-extractor.ts';
import { extractMicrodataCandidates } from './microdata-extractor.ts';
import { extractRecipeHtmlCandidates } from './html-extractor.ts';
import { extractRecipeFormValues } from './form-extractor.ts';
import {
  deduplicateOverlappingCandidates,
  selectBestCandidates,
} from './candidate-utils.ts';

export function extractIndependentSources(
  html: string,
  pageUrl: string,
  metadata: PageMetadata,
  readability: ParsedArticle | null,
): ExtractedPageSources {
  const document = cheerio.load(html);
  const jsonLd = extractJsonLdRecipes(document);
  const microdata = selectBestCandidates(
    deduplicateOverlappingCandidates(extractMicrodataCandidates(document)),
  );
  const recipeHtml = selectBestCandidates(
    deduplicateOverlappingCandidates(extractRecipeHtmlCandidates(document)),
  );
  const forms = extractRecipeFormValues(document);
  const images = buildRecipeImagesResult(
    jsonLd.flatMap((recipe) => extractSchemaMainImages(recipe, pageUrl)),
    jsonLd.flatMap((recipe) => extractSchemaStepImages(recipe, pageUrl)),
    extractHtmlImages(document, pageUrl),
    [
      ...metadataImage(metadata.openGraphImage),
      ...metadataImage(metadata.twitterImage),
    ],
  );
  const candidates = detectRecipeCandidates({
    $: document,
    jsonLd,
    microdata,
    recipeHtml,
    forms,
    readability,
  });
  return {
    jsonLd,
    microdata,
    recipeHtml,
    forms,
    images,
    metadata,
    readability,
    candidates,
  };
}

function metadataImage(url: string | null): RecipeImage[] {
  return url ? [{ url, source: 'metadata', score: 700 }] : [];
}
