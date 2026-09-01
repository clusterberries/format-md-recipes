import type * as cheerio from 'cheerio';
import type {
  FormRecipeValue,
  ParsedArticle,
  RecipeCandidate,
  RecipeContentCandidate,
} from '../types.ts';
import type { RecipeSchema } from '../images-parser/types.ts';
import { scoreJsonLdCandidate } from './json-ld-candidate.ts';
import { scoreContentCandidate } from './content-candidate.ts';
import { scoreFormCandidates } from './form-candidate.ts';
import { scoreReadabilityCandidate } from './readability-candidate.ts';

export function detectRecipeCandidates(params: {
  $: cheerio.CheerioAPI;
  jsonLd: RecipeSchema[];
  microdata: RecipeContentCandidate[];
  recipeHtml: RecipeContentCandidate[];
  forms: FormRecipeValue[];
  readability: ParsedArticle | null;
}): RecipeCandidate[] {
  const candidates = [
    ...params.jsonLd.map((recipe, index) =>
      scoreJsonLdCandidate(recipe, index, params.$),
    ),
    ...params.microdata.map((candidate, index) =>
      scoreContentCandidate(candidate, `microdata-${index}`, params.$, true),
    ),
    ...params.recipeHtml.map((candidate, index) =>
      scoreContentCandidate(candidate, `html-${index}`, params.$, false),
    ),
    ...scoreFormCandidates(params.forms),
    ...(params.readability
      ? [scoreReadabilityCandidate(params.readability)]
      : []),
  ];

  return candidates.sort((a, b) => b.score - a.score);
}
