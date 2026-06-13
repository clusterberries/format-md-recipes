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
