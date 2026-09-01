import * as cheerioLib from 'cheerio';
import type { ParsedArticle, RecipeCandidate } from '../types.ts';
import { NOISE_PATTERN, TIME_PATTERN } from './patterns.ts';
import { createSignals, buildCandidate } from './signals.ts';
import { countMatches } from './helpers.ts';

export function scoreReadabilityCandidate(
  article: ParsedArticle,
): RecipeCandidate {
  const text = `${article.title ?? ''} ${article.excerpt ?? ''} ${article.contentHtml}`;
  const signals = createSignals({
    ingredientCount: countMatches(text, /ingredient|ингредиент/gi),
    instructionCount: countMatches(
      text,
      /instruction|direction|step|инструкц|шаг/gi,
    ),
    vocabularyText: text,
    hasTitle: Boolean(article.title),
    hasServings: /servings?|yield|порци/i.test(text),
    hasTimes: TIME_PATTERN.test(text),
    hasImages: /<img\b/i.test(article.contentHtml),
    hasMicrodata: false,
    linkDensity: getHtmlLinkDensity(article.contentHtml),
    noisePenalty: NOISE_PATTERN.test(text) ? 1 : 0,
    consistencyText: text,
  });

  return buildCandidate(
    'readability-0',
    'readability',
    'readability',
    article.title,
    signals,
  );
}

function getHtmlLinkDensity(html: string): number {
  const fragment = cheerioLib.load(`<div>${html}</div>`);
  const text = fragment('div').text().trim().length;
  return text ? fragment('a').text().trim().length / text : 0;
}
