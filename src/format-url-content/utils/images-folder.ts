export const DEFAULT_IMAGES_FOLDER = 'attachments';

/** The folder is a single directory name beside the exported notes. */
export function validateImagesFolder(name: string): string {
  if (
    !name.trim() ||
    /[<>:"/\\|?*\p{Cc}]/u.test(name) ||
    /[. ]$/u.test(name) ||
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(name)
  ) {
    throw new Error('Images folder must be a valid folder name, not a path.');
  }
  return name;
}
