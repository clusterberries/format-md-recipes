import {
  DEFAULT_IMAGES_FOLDER,
  validateImagesFolder,
} from './utils/images-folder.ts';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fetchWithRetry } from './utils/http-fetch.ts';
import { writeFileAtomically } from './utils/atomic-file.ts';
import { logInfo, logWarning } from '../shared/utils.ts';
import type { ExtractedImage, ReconciledRecipe } from './types.ts';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_RECIPE_BYTES = 50 * 1024 * 1024;

/** Only collect images the renderer will emit, after conflict resolution. */
export function collectRenderedImages(
  recipe: ReconciledRecipe,
  includeSteps: boolean,
) {
  const images: Array<{ image: ExtractedImage; postfix: string }> = [];
  if (recipe.mainImage)
    images.push({ image: recipe.mainImage, postfix: 'main' });
  if (includeSteps) {
    recipe.instructions.value.forEach((instruction, index) => {
      if (instruction.image)
        images.push({
          image: instruction.image,
          postfix: `step-${String(index + 1).padStart(2, '0')}`,
        });
    });
  }
  const seen = new Set<string>();
  return images.filter(({ image }) => {
    if (seen.has(image.url)) return false;
    seen.add(image.url);
    return true;
  });
}

export async function downloadRecipeImages(
  images: ReturnType<typeof collectRenderedImages>,
  output: string,
  imagesFolder = DEFAULT_IMAGES_FOLDER,
): Promise<{ destinations: Map<string, string>; failed: number }> {
  const destinations = new Map<string, string>();
  // Keep the final note stem (including batch collision suffixes), except
  // characters unsuitable for attachment links and very long filenames.
  const stem =
    Array.from(
      path
        .basename(output, path.extname(output))
        .replace(/[<>:"/\\|?*#^%[\]\p{Cc}]/gu, '-'),
    )
      .slice(0, 100)
      .join('')
      .replace(/[. ]+$/u, '') || 'recipe';
  const directory = path.join(
    path.dirname(output),
    validateImagesFolder(imagesFolder),
  );
  let bytesRemaining = MAX_RECIPE_BYTES;
  let failed = 0;
  // Sequential requests deliberately bound concurrency to one per import.
  for (const { image, postfix } of images) {
    try {
      if (bytesRemaining <= 0)
        throw new Error('Recipe image byte limit reached');
      const { buffer, contentType } = await fetchWithRetry(image.url, {
        maxBytes: Math.min(MAX_IMAGE_BYTES, bytesRemaining),
        validateContentType(value) {
          if (
            value &&
            !/^(image\/|application\/octet-stream(?:;|$))/i.test(value)
          ) {
            throw new Error(`Expected an image response, received ${value}`);
          }
        },
      });
      bytesRemaining -= buffer.byteLength;
      const extension = detectImageExtension(buffer);
      if (!extension)
        throw new Error(
          `Unsupported or invalid image (${contentType ?? 'unknown content type'})`,
        );
      const hash = createHash('sha256')
        .update(buffer)
        .digest('hex')
        .slice(0, 16);
      const destination = path.join(
        directory,
        `${stem}-${postfix}-${hash}.${extension}`,
      );
      try {
        await writeFileAtomically(destination, buffer, true);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (!(await readFile(destination)).equals(buffer))
          throw new Error(`Existing attachment differs: ${destination}`, {
            cause: error,
          });
      }
      destinations.set(
        image.url,
        encodeRelativePath(path.relative(path.dirname(output), destination)),
      );
    } catch (error) {
      failed++;
      logWarning(
        `Could not download ${image.url}: ${error instanceof Error ? error.message : String(error)}. Keeping remote URL.`,
      );
    }
  }
  logInfo(
    `Images: ${destinations.size} saved locally, ${failed} remote${failed ? ' (download failed)' : ''}.`,
  );
  return { destinations, failed };
}

function encodeRelativePath(value: string): string {
  return value
    .split(path.sep)
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

/** Sniff raster file signatures instead of trusting URL suffixes or MIME alone. */
function detectImageExtension(buffer: Buffer): string | null {
  if (
    buffer.length >= 24 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  )
    return 'png';
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return 'jpg';
  if (buffer.length >= 13 && /^GIF8[79]a$/.test(buffer.toString('ascii', 0, 6)))
    return 'gif';
  if (
    buffer.length >= 16 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'webp';
  if (buffer.length >= 26 && buffer.toString('ascii', 0, 2) === 'BM')
    return 'bmp';
  if (buffer.length >= 24 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const boxSize = buffer.readUInt32BE(0);
    if (boxSize >= 24 && boxSize <= buffer.length) {
      const brands = [buffer.toString('ascii', 8, 12)];
      for (let offset = 16; offset + 4 <= boxSize; offset += 4)
        brands.push(buffer.toString('ascii', offset, offset + 4));
      if (brands.includes('avif') || brands.includes('avis')) return 'avif';
    }
  }
  return null;
}
