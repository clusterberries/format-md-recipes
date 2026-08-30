import type {
  ExtractRecipeImagesResult,
  HtmlImageCandidate,
  RecipeImage,
  StepImage,
} from './types.ts';

export function buildRecipeImagesResult(
  schemaMainImages: RecipeImage[],
  schemaStepImages: StepImage[],
  htmlCandidates: HtmlImageCandidate[],
  metadataImages: RecipeImage[] = [],
): ExtractRecipeImagesResult {
  const explicitMainImage = schemaMainImages[0];
  const metadataMainImage = chooseBestHtmlMainImage(metadataImages);
  const associatedMainImage =
    metadataMainImage &&
    htmlCandidates.some((candidate) =>
      /(?:-\d+x\d+)(?:\.[a-z]+)?$/i.test(candidate.url),
    )
      ? metadataMainImage
      : (chooseBestHtmlMainImage(htmlCandidates) ?? metadataMainImage);
  const bestStepFallback =
    chooseLastStepImage(htmlCandidates) ?? schemaStepImages.at(-1);
  const mainImage = explicitMainImage
    ? explicitMainImage
    : associatedMainImage
      ? markFallbackImage(associatedMainImage, 'best-main')
      : markFallbackImage(bestStepFallback, 'last-step');
  const stepImages = mergeStepImages({
    schemaStepImages,
    htmlCandidates,
    ...(mainImage ? { mainImageUrl: mainImage.url } : {}),
  });

  return {
    ...(mainImage ? { mainImage } : {}),
    stepImages,
    htmlCandidates: htmlCandidates.map(
      ({ documentIndex: _, stepIndex: __, ...image }) => image,
    ),
  };
}

function markFallbackImage(
  image: RecipeImage | undefined,
  reason: 'best-main' | 'last-step',
): RecipeImage | undefined {
  if (!image) return undefined;

  return {
    ...image,
    isFallback: true,
    fallbackReason: reason,
    score: Math.min(image.score, 250),
  };
}

function chooseBestHtmlMainImage(
  candidates: RecipeImage[],
): RecipeImage | undefined {
  return [...candidates]
    .filter((candidate) => !('stepIndex' in candidate))
    .sort((a, b) => b.score - a.score)
    .find((candidate) => candidate.score > -50);
}

function chooseLastStepImage(
  candidates: HtmlImageCandidate[],
): HtmlImageCandidate | undefined {
  return [...candidates]
    .filter(
      (candidate): candidate is HtmlImageCandidate & { stepIndex: number } =>
        typeof candidate.stepIndex === 'number' && candidate.score > -50,
    )
    .sort((a, b) =>
      a.stepIndex === b.stepIndex
        ? b.documentIndex - a.documentIndex
        : b.stepIndex - a.stepIndex,
    )[0];
}

function mergeStepImages(params: {
  schemaStepImages: StepImage[];
  htmlCandidates: HtmlImageCandidate[];
  mainImageUrl?: string;
}): StepImage[] {
  const { schemaStepImages, htmlCandidates, mainImageUrl } = params;
  const result = schemaStepImages.filter((image) => image.url !== mainImageUrl);
  const coveredStepIndexes = new Set(result.map((image) => image.stepIndex));
  const htmlStepImages = htmlCandidates
    .filter(
      (image): image is HtmlImageCandidate & { stepIndex: number } =>
        typeof image.stepIndex === 'number',
    )
    .filter((image) => image.url !== mainImageUrl)
    .filter((image) => !coveredStepIndexes.has(image.stepIndex))
    .filter((image) => image.score > -50)
    .map(({ documentIndex: _, ...image }) => ({
      ...image,
      source: 'html' as const,
    }));
  const uniqueImages = new Map<string, StepImage>();

  for (const image of [...result, ...htmlStepImages]) {
    const key = `${image.stepIndex}:${image.url}`;
    const existing = uniqueImages.get(key);

    if (!existing || image.score > existing.score) {
      uniqueImages.set(key, image);
    }
  }

  const bestImageByStep = new Map<number, StepImage>();

  for (const image of uniqueImages.values()) {
    const existing = bestImageByStep.get(image.stepIndex);
    if (!existing || image.score > existing.score) {
      bestImageByStep.set(image.stepIndex, image);
    }
  }

  return [...bestImageByStep.values()].sort((a, b) => {
    if (a.stepIndex !== b.stepIndex) {
      return a.stepIndex - b.stepIndex;
    }

    return b.score - a.score;
  });
}
