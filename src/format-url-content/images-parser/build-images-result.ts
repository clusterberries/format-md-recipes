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
): ExtractRecipeImagesResult {
  const mainImage =
    schemaMainImages[0] ??
    chooseBestHtmlMainImage(htmlCandidates) ??
    chooseLastStepImage(htmlCandidates) ??
    schemaStepImages.at(-1);
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

function chooseBestHtmlMainImage(
  candidates: HtmlImageCandidate[],
): RecipeImage | undefined {
  return [...candidates]
    .filter((candidate) => candidate.stepIndex === undefined)
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

  return [...uniqueImages.values()].sort((a, b) => {
    if (a.stepIndex !== b.stepIndex) {
      return a.stepIndex - b.stepIndex;
    }

    return b.score - a.score;
  });
}