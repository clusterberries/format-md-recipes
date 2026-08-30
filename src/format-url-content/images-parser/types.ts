export interface RecipeSchema {
  [key: string]: unknown;
}

export type ImageSource = 'schema-main' | 'schema-step' | 'html' | 'metadata';

export type RecipeImage = {
  url: string;
  alt?: string;
  /* Where the image was found: recipe schema or HTML. */
  source: ImageSource;
  /* Heuristic ranking used to choose between image candidates. */
  score: number;
  isFallback?: boolean;
  fallbackReason?: 'best-main' | 'last-step';
};

export type StepImage = RecipeImage & {
  /* Zero-based recipe step number associated with the image. */
  stepIndex: number;
};

export type ExtractRecipeImagesResult = {
  /* Best image selected for the recipe itself. */
  mainImage?: RecipeImage;
  /* Images associated with individual recipe steps. */
  stepImages: StepImage[];
  /* All usable images found in the original HTML and metadata. */
  htmlCandidates: RecipeImage[];
};

export type HtmlImageCandidate = RecipeImage & {
  /* Position of the image in the HTML document. */
  documentIndex: number;
  /* Optional zero-based step number inferred from the HTML. */
  stepIndex?: number;
};
