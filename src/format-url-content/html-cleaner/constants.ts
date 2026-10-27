export const HARD_REMOVE_SELECTOR = [
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'canvas',
  'svg',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'option',
  'link',
  'meta',
  'base',
  '[hidden]',
  '[aria-hidden="true"]',
].join(',');

export const GLOBAL_NOISE_SELECTOR = [
  'nav',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="complementary"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(',');

export const MAIN_CONTENT_SELECTOR = [
  '[itemtype*="Recipe"]',
  '[itemprop="recipeInstructions"]',
  '[itemprop="recipeIngredient"]',
  'article',
  'main',
  '[role="main"]',
  '.entry-content',
  '.post-content',
  '.article-content',
  '.article-body',
  '.post-body',
  '.recipe-content',
  '.recipe-body',
  '.recipe-card',
  '.recipe-container',
  '.content',
  '#content',
  '#main',
];

// JS `\b` is ASCII-only, so Unicode-aware lookarounds are required for Cyrillic.
// Cookie/banner words are matched only in noise-specific forms: "cookie-ingredients" and
// "recipe-banner" are recipe content.
export const MINIMAL_NOISE_PATTERN =
  /(?<![a-z0-9])(?:ads?|advert(?:isement)?|cookie[-_ ]?(?:banner|consent|notice|law|bar|popup|settings|wall)|cookiebot|consent|cmp|gdpr|newsletter|subscribe|popup|modal|paywall|social-share|share-buttons?|(?:ads?|promo)[-_ ]banner|banner[-_ ]ads?)(?![a-z0-9])/i;

export const RECIPE_SIGNAL_PATTERN =
  /(?<![\p{L}\p{N}])(?:recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|(?:ингредиент|приготовлен|инструкц|рецепт|шаг)\p{L}*)(?![\p{L}\p{N}])/iu;

export const RECIPE_PROTECTION_SELECTOR =
  '[itemtype*="Recipe"], [itemprop="recipeIngredient"], [itemprop="recipeInstructions"]';

export const RECIPE_ROOT_SELECTOR = '[itemtype*="Recipe" i]';
export const RECIPE_ROOT_SCORE_SELECTOR = '[itemtype*="Recipe"]';
export const RECIPE_INGREDIENT_SELECTOR = '[itemprop="recipeIngredient" i]';
export const RECIPE_INSTRUCTION_SELECTOR = '[itemprop="recipeInstructions" i]';
export const RECIPE_COMPONENT_SELECTOR =
  '[itemprop="recipeIngredient"], [itemprop="recipeInstructions"]';

export const REMOVABLE_EMPTY_SELECTOR = [
  'div',
  'section',
  'article',
  'p',
  'span',
  'li',
  'ul',
  'ol',
  'figure',
  'figcaption',
  'table',
  'tbody',
  'thead',
  'tr',
].join(',');

export const CLEANUP_PASSES = 4;
export const MAX_RECIPE_TEXT_LENGTH = 1_500;
export const MIN_WRAPPER_FORM_TEXT_LENGTH = 1_000;
export const RECIPE_SIGNAL_TEXT_LENGTH = 3_000;
