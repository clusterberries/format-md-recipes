import type {
  ExtractRecipeImagesResult,
  ImageSource,
} from './images-parser/types.ts';

export interface CliOptions {
  inputUrl: string;
  output: string | null;
  noAi: boolean;
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
  finalUrl: string;
  rawHtml: string;
  metadata: PageMetadata;
  article: ParsedArticle | null;
  recipe: RecipeSchema | null;
  sources: ExtractedPageSources;
  normalizedRecipe: NormalizedRecipe;
  reconciledRecipe: ReconciledRecipe;
}

export interface PageMetadata {
  contentType: string | null;
  encoding: string;
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  language: string | null;
  openGraphImage: string | null;
  twitterImage: string | null;
}

export type RecipeSource = 'microdata' | 'html' | 'form';

export interface RecipeContentCandidate {
  source: RecipeSource;
  location: string;
  title: string | null;
  ingredients: string[];
  instructions: string[];
}

export type RecipeCandidateSource =
  | 'json-ld'
  | 'microdata'
  | 'html'
  | 'form'
  | 'readability';

export type FieldSource = RecipeCandidateSource | 'metadata';

export interface ExtractedField<T> {
  value: T;
  source: FieldSource;
  confidence: number;
  location: string;
  originalValue?: unknown;
}

export interface ExtractedIngredient {
  text: string;
  quantity?: string;
  unit?: string;
  name?: string;
  source: FieldSource;
  confidence: number;
  location: string;
  group?: string;
}

export interface ExtractedImage {
  url: string;
  alt?: string;
  source: ImageSource | 'metadata';
  confidence: number;
  location: string;
  role: 'main' | 'step' | 'gallery' | 'unknown';
  stepIndex?: number;
  isFallback?: boolean;
  fallbackReason?: 'best-main' | 'last-step';
}

export interface ExtractedInstruction {
  text: string;
  stepIndex: number;
  source: FieldSource;
  confidence: number;
  location: string;
  image?: ExtractedImage;
}

export interface SourceMetadata {
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string | null;
  language: string | null;
  encoding: string;
  contentType: string | null;
}

export interface NormalizedRecipe {
  title: ExtractedField<string>[];
  description: ExtractedField<string>[];
  servings: ExtractedField<string>[];
  prepTime: ExtractedField<string>[];
  cookTime: ExtractedField<string>[];
  totalTime: ExtractedField<string>[];
  ingredients: ExtractedIngredient[];
  instructions: ExtractedInstruction[];
  mainImage: ExtractedImage | null;
  stepImages: ExtractedImage[];
  galleryImages: ExtractedImage[];
  notes: ExtractedField<string>[];
  sourceMetadata: SourceMetadata;
}

export type ConflictReason =
  | 'different-values'
  | 'different-quantities'
  | 'different-order'
  | 'incomplete-source'
  | 'multiple-candidates';

export interface FieldConflict<T> {
  field: string;
  selected: ExtractedField<T> | null;
  alternatives: ExtractedField<T>[];
  reason: ConflictReason;
}

export interface ReconciledField<T> {
  value: T | null;
  source: FieldSource | null;
  confidence: number;
  location: string | null;
  alternatives: ExtractedField<T>[];
  conflicts: FieldConflict<T>[];
  selectionReason: string | null;
}

export interface ReconciledCollection<T> {
  value: T[];
  source: FieldSource | null;
  confidence: number;
  alternatives: T[][];
  conflicts: CollectionConflict<T>[];
  selectionReason: string | null;
}

export interface CollectionConflict<T> {
  field: string;
  selected: T[];
  alternatives: T[][];
  reason: ConflictReason;
}

export interface ReconciledRecipe {
  title: ReconciledField<string>;
  description: ReconciledField<string>;
  servings: ReconciledField<string>;
  prepTime: ReconciledField<string>;
  cookTime: ReconciledField<string>;
  totalTime: ReconciledField<string>;
  ingredients: ReconciledCollection<ExtractedIngredient>;
  instructions: ReconciledCollection<ExtractedInstruction>;
  mainImage: ExtractedImage | null;
  stepImages: ExtractedImage[];
  galleryImages: ExtractedImage[];
  notes: ExtractedField<string>[];
  conflicts: Array<FieldConflict<unknown>>;
  sourceMetadata: SourceMetadata;
}

export interface RecipeCandidateSignals {
  ingredientCount: number;
  instructionCount: number;
  recipeVocabulary: number;
  hasTitle: boolean;
  hasServings: boolean;
  hasTimes: boolean;
  hasImages: boolean;
  hasMicrodata: boolean;
  linkDensity: number;
  noisePenalty: number;
  internalConsistency: number;
}

export interface RecipeCandidate {
  id: string;
  source: RecipeCandidateSource;
  location: string;
  score: number;
  title: string | null;
  signals: RecipeCandidateSignals;
}

export interface FormRecipeValue {
  location: string;
  label: string | null;
  name: string | null;
  value: string;
}

export interface ExtractedPageSources {
  jsonLd: RecipeSchema[];
  microdata: RecipeContentCandidate[];
  recipeHtml: RecipeContentCandidate[];
  forms: FormRecipeValue[];
  images: ExtractRecipeImagesResult;
  metadata: PageMetadata;
  readability: ParsedArticle | null;
  candidates: RecipeCandidate[];
}
