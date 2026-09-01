import type {
  ExtractedPageSources,
  NormalizedRecipe,
  SourceMetadata,
} from '../types.ts';
import {
  cleanRecipeDescription,
  cleanRecipeTitle,
  extractCandidateMetaFields,
  extractSchemaField,
  fieldFromValue,
} from './scalar-fields.ts';
import { extractIngredients } from './ingredients.ts';
import { extractInstructions } from './instructions.ts';
import { extractImages } from './images.ts';

export function extractNormalizedRecipe(
  sources: ExtractedPageSources,
  sourceMetadata: SourceMetadata,
): NormalizedRecipe {
  const title = [
    ...sources.jsonLd.flatMap((recipe, index) =>
      fieldFromValue<string>(
        cleanRecipeTitle(typeof recipe.name === 'string' ? recipe.name : null),
        'json-ld',
        `json-ld-${index}.name`,
      ),
    ),
    ...sources.microdata.flatMap((candidate) =>
      fieldFromValue<string>(
        cleanRecipeTitle(candidate.title),
        'microdata',
        candidate.location,
      ),
    ),
    ...sources.recipeHtml.flatMap((candidate) =>
      fieldFromValue<string>(
        cleanRecipeTitle(candidate.title),
        'html',
        candidate.location,
      ),
    ),
    ...fieldFromValue<string>(
      cleanRecipeTitle(sources.readability?.title),
      'readability',
      'readability.title',
    ),
    ...fieldFromValue<string>(
      cleanRecipeTitle(sources.metadata.title),
      'metadata',
      'metadata.title',
    ),
  ];
  const description = [
    ...sources.jsonLd.flatMap((recipe, index) =>
      fieldFromValue<string>(
        cleanRecipeDescription(
          typeof recipe.description === 'string' ? recipe.description : null,
        ),
        'json-ld',
        `json-ld-${index}.description`,
      ),
    ),
    ...sources.microdata.flatMap((candidate) =>
      fieldFromValue<string>(
        cleanRecipeDescription(candidate.description),
        'microdata',
        `${candidate.location}.description`,
      ),
    ),
    ...sources.recipeHtml.flatMap((candidate) =>
      fieldFromValue<string>(
        cleanRecipeDescription(candidate.description),
        'html',
        `${candidate.location}.description`,
      ),
    ),
    ...fieldFromValue<string>(
      cleanRecipeDescription(sources.metadata.description),
      'metadata',
      'metadata.description',
    ),
    ...fieldFromValue<string>(
      cleanRecipeDescription(sources.readability?.excerpt),
      'readability',
      'readability.excerpt',
    ),
  ];

  const normalized: NormalizedRecipe = {
    title,
    description,
    servings: [
      ...extractSchemaField(sources.jsonLd, 'recipeYield', 'servings'),
      ...extractCandidateMetaFields(sources.microdata, 'servings'),
      ...extractCandidateMetaFields(sources.recipeHtml, 'servings'),
    ],
    prepTime: [
      ...extractSchemaField(sources.jsonLd, 'prepTime', 'prepTime'),
      ...extractCandidateMetaFields(sources.microdata, 'prepTime'),
      ...extractCandidateMetaFields(sources.recipeHtml, 'prepTime'),
    ],
    cookTime: [
      ...extractSchemaField(sources.jsonLd, 'cookTime', 'cookTime'),
      ...extractCandidateMetaFields(sources.microdata, 'cookTime'),
      ...extractCandidateMetaFields(sources.recipeHtml, 'cookTime'),
    ],
    totalTime: [
      ...extractSchemaField(sources.jsonLd, 'totalTime', 'totalTime'),
      ...extractCandidateMetaFields(sources.microdata, 'totalTime'),
      ...extractCandidateMetaFields(sources.recipeHtml, 'totalTime'),
    ],
    ingredients: extractIngredients(sources),
    instructions: extractInstructions(sources),
    mainImage: null,
    stepImages: [],
    galleryImages: [],
    notes: [],
    sourceMetadata,
  };

  const images = extractImages(sources.images, sources.metadata);
  normalized.mainImage = images.mainImage;
  normalized.stepImages = images.stepImages;
  normalized.galleryImages = images.galleryImages;
  normalized.instructions = normalized.instructions.map((instruction) => {
    const image = normalized.stepImages.find(
      (candidate) => candidate.stepIndex === instruction.stepIndex,
    );
    return image ? { ...instruction, image } : instruction;
  });

  return normalized;
}
