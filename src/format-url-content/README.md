# Format URL Content

Fetch an English or Russian recipe page and save the recipe as Markdown.

## Usage

Run these commands from the project root:

```bash
npm run format-url-content -- -i <url> -o recipe.md
npm run format-url-content -- -i <url> -o recipe.md --download-images
npm run format-url-content -- --input-file urls.txt --dest Recipes --download-images
```

For batch imports, put one URL per line in `urls.txt`. Blank lines, comments starting with `#`, and duplicate URLs are skipped. Notes are named after recipe titles, with suffixes such as `-2` to avoid overwriting existing notes. Failed pages are reported and the batch continues.

Options:

- `--no-ai`: disable AI conflict resolution.
- `--main-image-only`: include only the main image, at the bottom of the note.
- `--download-images`: save images locally. Requires `-o` or batch `--dest`.
- `--images-folder <name>`: folder name beside the notes, default `attachments`. Use with `--download-images`; enter a name, not a path.

Without `-o`, a single-page run prints diagnostic JSON with a short Markdown preview.

## How it works

The script fetches the page, extracts recipe fields from structured data and HTML, and reconciles the results. AI is used only when conflicting extractions need review. If no recipe is identified, it exports cleaned article content instead.

The final recipe is rendered as Markdown. Page and image downloads share networking helpers in `utils`.

## Saving images

By default, image links point to the original website. With `--download-images`:

1. Choose the final note filename, including any batch suffix.
2. Download only the main image and step images included in the note. Repeated URLs are downloaded once. Article fallback exports include only the selected main image.
3. Save the images, then save the note with relative Markdown links.

Example output:

```text
Recipes/
  Tomato Soup.md
  attachments/
    Tomato Soup-main-<hash>.jpg
    Tomato Soup-step-01-<hash>.png
```

All notes in the output directory share one images folder, with no recipe subfolders. To use a different name:

```bash
npm run format-url-content -- --input-file urls.txt --dest Recipes --download-images --images-folder images
```

Image names start with the final note name, followed by their role and a short content hash. Unsafe characters are replaced and long names are shortened. Matching existing images are reused; existing attachments are never automatically deleted.

Original image bytes are kept. Supported formats are JPEG, PNG, GIF, WebP, BMP, and AVIF. Downloads have timeouts, retries for temporary failures, and size limits: 10 MiB per image and 50 MiB of completed image responses per recipe.

If a download fails, the note keeps that image's remote URL and the script logs a warning. The recipe is still saved, and batch summaries report notes that retain remote images.

For Obsidian, export into your vault or copy the notes **together with their images folder**, keeping the same layout. Relative links support spaces and Russian filenames. No plugin is needed.
