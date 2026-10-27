// JS `\b` is ASCII-only, so Unicode-aware lookarounds are required for Cyrillic.
export const RECIPE_WORD_PATTERN =
  /(?<![\p{L}\p{N}])(?:recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|servings?|(?:рецепт|ингредиент|инструкц|приготовлен|шаг|порци)\p{L}*)(?![\p{L}\p{N}])/giu;
export const NOISE_PATTERN =
  /(?<![\p{L}\p{N}])(?:ads?(?![\p{L}\p{N}])|advert|banner|cookie[-_ ]?(?:banner|consent|notice|policy|settings)|consent|newsletter|subscribe|popup|modal|comment|review|related|recommend|sidebar|реклам|подпис|комментар|похож|рекоменд)/iu;
export const TIME_PATTERN =
  /(?:prep|cook|total)[a-z -]*time|(?:врем|минут|час)/i;
