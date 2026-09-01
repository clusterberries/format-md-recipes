import type {
  ExtractedImage,
  ExtractedPageSources,
  PageMetadata,
} from '../types.ts';
import type { RecipeImage } from '../images-parser/types.ts';

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
