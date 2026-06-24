import path from 'path';
import fs from 'fs/promises';
import { collectMarkdownFiles, getOutputPath, readFile, writeFile } from './file-utils.js';
import { buildPrompt } from './prompt-builder.js';
import { callOpenAI } from './openai-client.js';

function getPrefixedOutputPath(inputPath) {
    return path.join(path.dirname(inputPath), `formatted-${path.basename(inputPath)}`);
}

async function formatSingleFile(inputPath, outputPath, model, dryRun) {
  const inputText = await readFile(inputPath);
  const prompt = buildPrompt(inputText, { input: inputPath });
  const formatted = await callOpenAI(prompt, model);

  if (dryRun) {
    process.stdout.write(`--- FILE: ${inputPath}\n`);
    process.stdout.write(formatted + '\n');
    return null;
  }

  if (outputPath) {
    await writeFile(outputPath, formatted);
    return outputPath;
  }

  process.stdout.write(formatted + '\n');
  return null;
}

export async function runFormatter(options) {
    const { inputPath, output, dest, rewrite, formattedPrefix, model, dryRun } = options;

  if (!path.isAbsolute(inputPath)) {
    throw new Error(`Input path must be absolute: ${inputPath}`);
  }

  const stats = await fs.stat(inputPath);
  const isDirectory = stats.isDirectory();

  if (isDirectory) {
      if (!rewrite && !dest && !formattedPrefix) {
          throw new Error('When input is a directory, --dest <folder> is required unless --rewrite or --formatted-prefix is used.');
    }

    const markdownFiles = await collectMarkdownFiles(inputPath);
    if (markdownFiles.length === 0) {
      console.log(`No markdown files found in ${inputPath}`);
      return;
    }

    const writtenFiles = [];
    for (const filePath of markdownFiles) {
        const outputPath = rewrite
            ? filePath
            : formattedPrefix
                ? getPrefixedOutputPath(filePath)
                : getOutputPath(filePath, inputPath, dest);
      const written = await formatSingleFile(filePath, outputPath, model, dryRun);
      if (written) {
        writtenFiles.push(written);
      }
    }

    if (!dryRun) {
        if (rewrite) {
            console.log(`Rewrote ${writtenFiles.length} markdown file(s) in place.`);
        } else if (formattedPrefix) {
            console.log(`Formatted ${writtenFiles.length} markdown file(s) with prefix formatted- in ${inputPath}`);
        } else {
          console.log(`Formatted ${writtenFiles.length} markdown file(s) to ${dest}`);
      }
    }
  } else {
    let outputPath = null;
      if (rewrite) {
          outputPath = inputPath;
      } else if (formattedPrefix) {
          outputPath = getPrefixedOutputPath(inputPath);
      } else if (dest) {
      outputPath = path.resolve(dest, path.basename(inputPath));
    } else if (output) {
      outputPath = output;
    }

    const written = await formatSingleFile(inputPath, outputPath, model, dryRun);
    if (!dryRun && written) {
        if (rewrite) {
            console.log(`Rewrote markdown file: ${written}`);
        } else {
          console.log(`Formatted markdown written to ${written}`);
      }
    }
  }
}
