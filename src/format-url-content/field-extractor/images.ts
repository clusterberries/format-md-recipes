import type {
  ExtractedImage,
  ExtractedInstruction,
  ExtractedPageSources,
  PageMetadata,
} from '../types.ts';
import type { RecipeImage } from '../images-parser/types.ts';

export function attachInstructionImages(
  instructions: ExtractedInstruction[],
  images: ExtractedImage[],
): ExtractedInstruction[] {
  const schemaSteps = instructions.filter((step) => step.source === 'json-ld');
  const htmlSteps = instructions.filter((step) => step.source === 'html');
  const visibleSteps = htmlSteps.length
    ? htmlSteps
    : instructions.filter((step) => step.source === 'microdata');
  return instructions.map((instruction, index) => {
    const image = images.find((image) => {
      const reference =
        image.source === 'schema-step' ? schemaSteps : visibleSteps;
      if (!reference.length || reference[0]?.source === instruction.source) {
        return image.stepIndex === instruction.stepIndex;
      }
      // Different sources may split steps differently. Match the same occurrence
      // of the text rather than borrowing an image solely by numeric position.
      const occurrence = instructions
        .slice(0, index)
        .filter(
          (step) =>
            step.source === instruction.source &&
            step.text === instruction.text,
        ).length;
      const matchingStep = reference.filter(
        (step) => step.text === instruction.text,
      )[occurrence];
      return (
        matchingStep !== undefined && image.stepIndex === matchingStep.stepIndex
      );
    });
    return image
      ? {
          ...instruction,
          image: { ...image, stepIndex: instruction.stepIndex },
        }
      : instruction;
  });
}

export function extractImages(
  images: ExtractedPageSources['images'],
  metadata: PageMetadata,
): {
  mainImage: ExtractedImage | null;
  stepImages: ExtractedImage[];
  galleryImages: ExtractedImage[];
} {
  const mainImage = images.mainImage
    ? toExtractedImage(images.mainImage, 'main', 'images.mainImage')
    : metadata.openGraphImage
      ? toExtractedImage(
          { url: metadata.openGraphImage, source: 'metadata', score: 500 },
          'main',
          'metadata.openGraphImage',
        )
      : null;
  const stepImages = images.stepImages.map((image) =>
    toExtractedImage(image, 'step', `images.stepImages[${image.stepIndex}]`),
  );
  const galleryImages = images.htmlCandidates
    .filter(
      (image) =>
        image.url !== mainImage?.url &&
        !stepImages.some((step) => step.url === image.url),
    )
    .map((image) =>
      toExtractedImage(image, 'gallery', `images.htmlCandidates[${image.url}]`),
    );
  return { mainImage, stepImages, galleryImages };
}

function toExtractedImage(
  image: RecipeImage,
  role: ExtractedImage['role'],
  location: string,
): ExtractedImage {
  const extracted: ExtractedImage = {
    url: image.url,
    source: image.source,
    confidence: Math.max(0, Math.min(1, image.score / 1000)),
    location,
    role,
  };
  if (image.alt) extracted.alt = image.alt;
  if ('stepIndex' in image && typeof image.stepIndex === 'number')
    extracted.stepIndex = image.stepIndex;
  if (image.isFallback) extracted.isFallback = true;
  if (image.fallbackReason) extracted.fallbackReason = image.fallbackReason;
  return extracted;
}
