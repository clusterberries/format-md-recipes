# format-md-recipes

A small Node.js toolkit for formatting or converting Markdown recipe files using OpenAI.

## Setup

1. Set your OpenAI API key in `.env`:

```env
OPENAI_API_KEY=your_api_key_here
```

2. Install dependencies:

```bash
npm install
```

## Usage

```bash
npm run format -- -i <input> [options]
```

## Commands and options

### Required

- `-i, --input <path>` — Path to the input Markdown file or directory.

### Output options

- `-o, --output <path>` — Write the result to a specific output file. If omitted for a single file, output can be printed to stdout.
- `-d, --dest <path>` — Write processed files to a destination directory. Useful when the input is a folder and you want to preserve file names and relative paths.

### Write mode options

- `--rewrite` — Rewrite the original file or files in place.
- `--formatted-prefix` — Create new formatted files in the same folder using the `formatted-` prefix.

### Preview option

- `--dry-run` — Calls the model only to determine how the file should be handled, but does not call the main processing model, does not process the file itself, and does not write anything anywhere.

## Option rules

- `--output` and `--dest` cannot be used together.
- `--rewrite` cannot be used with `--output` or `--dest`.
- `--formatted-prefix` cannot be used with `--output`, `--dest`, or `--rewrite`.

## Examples

Rewrite the original file in place:

```bash
npm run format -- -i recipes/source.md --rewrite
```

Create a new file in the same folder with the `formatted-` prefix:

```bash
npm run format -- -i recipes/source.md --formatted-prefix
```

Process all Markdown files in a folder and write them to another folder:

```bash
npm run format -- -i recipes/source-folder -d recipes/formatted-folder
```

Run a preview without processing the file or writing output:

```bash
npm run format -- -i recipes/source.md --dry-run
```