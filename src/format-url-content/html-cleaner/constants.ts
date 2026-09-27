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

export const MINIMAL_NOISE_PATTERN =
  /\b(ad|ads|advert|advertisement|banner|cookie|consent|cmp|gdpr|newsletter|subscribe|popup|modal|paywall|social-share|share-buttons?)\b/i;

export const RECIPE_SIGNAL_PATTERN =
  /\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|ингредиент|приготовлен|инструкц|рецепт|шаг)\b/i;

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
export const RECIPE_SIGNAL_TEXT_LENGTH = 3_000;
