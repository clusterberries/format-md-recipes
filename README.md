# format-md-recipes

A small Node.js toolkit for formatting recipes in markdown using the OpenAI API.

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

Format a markdown file and print output to the terminal:

```bash
npm run format -- -i recipes/source.md
```

Write formatted output to a file:

```bash
npm run format -- -i recipes/source.md -o recipes/formatted.md
```

Create a new formatted file in the same folder with a `formatted-` prefix:

```bash
npm run format -- -i recipes/source.md --formatted-prefix
```

Create new formatted files for all markdown files in a folder with `formatted-` prefix:

```bash
npm run format -- -i recipes/source-folder --formatted-prefix
```

Rewrite the original markdown file in place:

```bash
npm run format -- -i recipes/source.md --rewrite
```

Rewrite all markdown files in a folder in place:

```bash
npm run format -- -i recipes/source-folder --rewrite
```

Format all markdown files in a folder and write them to a destination folder with the same file names and relative paths preserved:

```bash
npm run format -- -i recipes/source-folder -d recipes/formatted-folder
```
