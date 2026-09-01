export const RECIPE_WORD_PATTERN =
  /\b(recipe|ingredients?|instructions?|directions?|method|preparation|steps?|how-to|servings?|рецепт|ингредиент|инструкц|приготовлен|шаг|порци)\b/gi;
export const NOISE_PATTERN =
  /\b(ad|advert|advertisement|banner|cookie|consent|newsletter|subscribe|popup|modal|comment|review|related|recommend|sidebar|реклама|подпис|комментар|похож|рекоменд)/i;
export const TIME_PATTERN =
  /(?:prep|cook|total)[a-z -]*time|(?:врем|минут|час)/i;
