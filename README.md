# format-md-recipes

A small Node.js toolkit for formatting or converting Markdown recipe files using OpenAI.

## Setup

1. Set your OpenAI API key in `.env`:

```env
OPENAI_API_KEY=your_api_key_here

# Optional model configuration
OPENAI_MODEL_MINI=gpt-5.4-mini
OPENAI_MODEL_MEDIUM=gpt-5.4
OPENAI_MODEL_FULL=gpt-5.5
```

2. Install dependencies:

```bash
npm install
```

## Format MD

Format Markdown files or directories with OpenAI:

```bash
npm run format -- -i <input> [options]
```

- `-i, --input <path>` — Input file or directory.
- `-o, --output <file>` — Write one result to a file.
- `-d, --dest <folder>` — Write results to a destination folder.
- `--rewrite` — Replace the original file or files.
- `--formatted-prefix` — Create `formatted-` files alongside the originals.
- `--dry-run` — Print the formatted result without writing a file.

Use only one output mode: `--output`, `--dest`, `--rewrite`, or `--formatted-prefix`.

Examples:

```bash
npm run format -- -i recipes/source.md --rewrite
npm run format -- -i recipes/source.md --formatted-prefix
npm run format -- -i recipes/source-folder -d recipes/formatted-folder
npm run format -- -i recipes/source-folder --dest recipes/formatted-folder
```

## Format URL Content

Fetch a recipe page and convert its content to Markdown:

```bash
npm run format-url-content -- -i <url> [options]
```

- `-i, --input <url>` — Recipe page URL to fetch and format.
- `-o, --output <file>` — Write Markdown to a file; otherwise print it to stdout.
- `--no-ai` — Disable AI conflict resolution when extracted fields disagree.
- `--main-image-only` — Include only the main image, placed at the end of the recipe.

Example:

```bash
npm run format-url-content -- -i https://example.com/recipe --output recipe.md
```

## Format list

Format a text file containing a list.

```bash
npm run format-list -- -i <input> [options]
```

### Options

- `--dry-run` — prints the result to stdout without writing to a file.
