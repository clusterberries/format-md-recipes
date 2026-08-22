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

export const RECIPE_ONLY_STRUCTURAL_NOISE_SELECTOR = [
  'noindex',
  '[itemprop="nutrition" i]',
  '[id*="nutrition" i]',
  '[class*="nutrition" i]',
  '[id*="nutr" i]',
  '[class*="nutr" i]',
  '[id*="calor" i]',
  '[class*="calor" i]',
  '[id*="similar" i]',
  '[class*="similar" i]',
  '[id*="related" i]',
  '[class*="related" i]',
  '[id*="recommend" i]',
  '[class*="recommend" i]',
  '[id*="advice" i]',
  '[class*="advice" i]',
  '[id*="rating" i]',
  '[class*="rating" i]',
  '[id*="review" i]',
  '[class*="review" i]',
  '[id*="reaction" i]',
  '[class*="reaction" i]',
  '[id*="comment" i]',
  '[class*="comment" i]',
  '[id*="sidebar" i]',
  '[class*="sidebar" i]',
  '[id*="share" i]',
  '[class*="share" i]',
  '[id*="social" i]',
  '[class*="social" i]',
].join(',');

export const BRANDING_IMAGE_SELECTOR = [
  'img[alt*="logo" i]',
  'img[alt*="avatar" i]',
  'img[alt*="premium" i]',
  'img[src*="/logo" i]',
  'img[src*="logo-" i]',
  'img[src*="avatar" i]',
  'img[src*="premium" i]',
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

export const RECIPE_ONLY_NOISE_PATTERN =
  /\b(ad|ads|advert|advertisement|banner|cookie|consent|cmp|gdpr|newsletter|subscribe|popup|modal|paywall|social-share|share-buttons?|comment|comments|review|reviews|rating|related|recommend|popular|trending|sidebar|author-bio|author-box|bio|breadcrumbs?|pagination|next-post|previous-post|video-player|podcast)\b/i;

export const RECIPE_SIGNAL_PATTERN =
  /\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|ингредиент|приготовлен|инструкц|рецепт|шаг)\b/i;

export const NOISE_TEXT_PATTERN =
  /^(advertisement|реклама|subscribe|подписаться|accept cookies|принять cookies|comments?|комментарии)$/i;

export const RECIPE_ONLY_BLOCK_TEXT_PATTERN =
  /\b(you may also like|related recipes?|recommended recipes?|similar recipes?)\b|подобные рецепты|похожие рецепты|рецепты по теме|статьи по теме|вам также может понравиться|лучшие рецепты|пик сезона|подписывайтесь|ставьте лайки|сказать автору|спасибо автору|оценить рецепт|рейтинг|эмоции|проигрыватель|авторские фото|пользовательские фото|прохожий|поиск по сайту|реклама на сайте|все права на материалы|администрация сайта|автор|поддержать|запланировать/i;

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
