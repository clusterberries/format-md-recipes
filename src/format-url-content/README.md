# Format URL Content

Converts English and Russian recipe pages to Markdown. Entry point: `src/format-url-content.ts`.

## Usage

Run from the project root:

```bash
npm run format-url-content -- -i <url> [options]
```

- `-i, --input <url>` — Fetch a single recipe page.
- `--input-file <file>` — Read a UTF-8 file containing one URL per line.
- `-o, --output <file>` — Save a single recipe as Markdown; omit to print diagnostic JSON.
- `-d, --dest <folder>` — Output directory for `--input-file`.
- `--no-ai` — Disable AI conflict resolution.
- `--main-image-only` — Skip step images and place the main image at the bottom.
- `--download-images` — Save rendered images locally; requires `--output` or batch `--dest`.
- `--images-folder <name>` — Folder beside the notes for downloaded images; default `attachments`. Use a folder name, not a path.
- `-h, --help` — Show CLI help.

Choose exactly one of `--input` or `--input-file`. Batch mode requires `--dest` and cannot use `--output`.

Examples:

```bash
npm run format-url-content -- -i https://example.com/recipe -o recipe.md --no-ai
npm run format-url-content -- -i https://example.com/recipe -o recipe.md --download-images --main-image-only
npm run format-url-content -- --input-file urls.txt --dest Recipes --download-images --images-folder images
```

## Pipeline

1. `cli.ts` parses options. `batch.ts` processes URL lists, chooses unique filenames, and continues after individual failures.
2. `parser/page-parser.ts` fetches and decodes HTML, reads metadata, and runs Readability for article fallback.
3. `source-extractor/` extracts JSON-LD, microdata, HTML, and form values. `field-extractor/` normalizes fields and associates step images.
4. `parser/reconciler.ts` compares complete source collections. Scalars prefer structured sources; collections prefer completeness, then source priority. Ingredients can be supplemented from other sources. Repetitions within a collection are preserved.
5. `ai-conflict-resolver/` optionally selects, merges, or filters extracted values when sources disagree. `--no-ai` skips it; invalid responses and API failures retain the deterministic result. Unresolved ingredients or instructions trigger article fallback.
6. `markdown/` renders the recipe. If ingredients or instructions are missing or visibly malformed, it renders cleaned page content instead. `url-content-formatter.ts` coordinates rendering and saving. Known Google AMP wrappers and HTML redirect notices are followed to the destination; notices without a usable destination fail rather than becoming recipe notes.

## Selection rules

Only one JSON-LD recipe supplies fields and images. Prefer a match to the fetched or canonical URL through `url`, `@id`, or `mainEntityOfPage`, ignoring fragments. Next prefer both ingredients and instructions, then more entries; ties use document order. Exact duplicate objects are ignored. Separate `@id` references are not resolved.

Text and images share the traversal of nested instruction sections. Across sources, step images are matched by text occurrence when a reference collection is available.

## Output

Notes end with a source link: the canonical HTTP(S) URL, or the final fetched URL when no usable canonical is present. HTML images prefer the largest valid responsive variant (`srcset`, including lazy attributes and `<picture>` sources) before single-image URLs.

Without `-o`, a single-page run prints diagnostic JSON. Files are written atomically. Images remain remote by default; `--download-images` saves rendered images beside the note in `attachments` (or `--images-folder`). The final note name and image content hash determine attachment names. Existing matching files are reused; failed downloads retain remote URLs.

Run logs: `logs/format-url-content.log` (5 MB rotation; override with `FORMAT_URL_CONTENT_LOG_FILE`). The terminal shows progress, warnings, and errors; tests use temporary logs.

Page and image requests share bounded fetching in `utils/http-fetch.ts`: timeouts, transient retries, redirect validation, and response size limits. Image downloads also have a per-recipe byte budget.

## Tests

Run `npm test`. The integration suite serves local HTML, invokes the CLI with `--no-ai`, and compares complete output with `.md` fixtures in `tests/fixtures/`. Encoding cases vary the HTTP headers and response bytes. AI decisions and network failures use mocked tests to inspect behavior that Markdown alone cannot show.
