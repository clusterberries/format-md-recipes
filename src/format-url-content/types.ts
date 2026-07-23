export interface CliOptions {
  inputUrl: string;
  output: string | null;
}

export interface ParsedArticle {
  title: string | null;
  excerpt: string | null;
  contentHtml: string;
  length: number;
}

export interface RecipeSchema {
  [key: string]: unknown;
}

export interface ParsedRecipePage {
  url: string;
  article: ParsedArticle | null;
  recipe: RecipeSchema | null;
}