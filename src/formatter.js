import path from 'path';
import fs from 'fs/promises';
import { collectMarkdownFiles, getOutputPath, readFile, writeFile } from './file-utils.js';
import { buildPrompt } from './prompt-builder.js';
import { callOpenAI } from './openai-client.js';

function logWarning(message) {
  const yellow = '\u001b[33m';
  const reset = '\u001b[0m';
  console.warn(`⚠️  ${yellow}Warning:${reset} ${message}`);
}

function getPrefixedOutputPath(inputPath) {
  return path.join(path.dirname(inputPath), `formatted-${path.basename(inputPath)}`);
}

async function formatSingleFile(inputPath, outputPath, model, dryRun) {
  const inputText = await readFile(inputPath);
  let formatted;

  if (!inputText || inputText.trim() === '') {
    logWarning(`Input file is empty: ${inputPath}.`);
    formatted = '';
  } else {
    const prompt = buildPrompt(inputText, { input: inputPath });
    formatted = await callOpenAI(prompt, model);

    if (formatted === '') {
      logWarning(`OpenAI returned no content for ${inputPath}.`);
    }
  }

  if (dryRun) {
    console.log(`\n=== Dry run preview: ${inputPath} ===`);
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

    console.log(`${dryRun ? 'Dry run: ' : ''}Processing ${markdownFiles.length} markdown file(s) from ${inputPath} using model ${model}.`);

    const writtenFiles = [];
    let index = 0;
    for (const filePath of markdownFiles) {
      index += 1;
      const outputPath = rewrite
        ? filePath
        : formattedPrefix
          ? getPrefixedOutputPath(filePath)
          : getOutputPath(filePath, inputPath, dest);

      const relativeInputPath = path.relative(inputPath, filePath);
      const relativeOutputPath = outputPath ? path.relative(inputPath, outputPath) : null;
      const progressMessage = dryRun
        ? `Dry run ${index}/${markdownFiles.length}: ${relativeInputPath}`
        : rewrite
          ? `Rewriting ${index}/${markdownFiles.length}: ${relativeInputPath}`
          : `Formatting ${index}/${markdownFiles.length}: ${relativeInputPath} -> ${relativeOutputPath}`;

      console.log(progressMessage);

      let written;
      try {
        written = await formatSingleFile(filePath, outputPath, model, dryRun);
      } catch (error) {
        throw new Error(`Error formatting ${filePath}: ${error.message}`);
      }

      if (written) {
        writtenFiles.push(written);
      }
    }

    if (!dryRun) {
      if (rewrite) {
        console.log(`✅ Rewrote ${writtenFiles.length} markdown file(s) in place.`);
      } else if (formattedPrefix) {
        console.log(`✅ Formatted ${writtenFiles.length} markdown file(s) with prefix formatted- in ${inputPath}`);
      } else {
        console.log(`✅ Formatted ${writtenFiles.length} markdown file(s) to ${dest}`);
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

    const actionLabel = dryRun ? 'Dry run' : rewrite ? 'Rewriting' : 'Formatting';
    console.log(`${actionLabel} file: ${inputPath} using model ${model}.`);

    let written;
    try {
      written = await formatSingleFile(inputPath, outputPath, model, dryRun);
    } catch (error) {
      throw new Error(`Error formatting ${inputPath}: ${error.message}`);
    }

    if (!dryRun) {
      if (written) {
        if (rewrite) {
          console.log(`✅ Rewrote markdown file: ${written}`);
        } else if (outputPath) {
          console.log(`✅ Formatted markdown written to ${written}`);
        } else {
          console.log('✅ Formatted markdown output sent to stdout.');
        }
      }
    } else {
      console.log('✅ Dry run complete.');
    }
  }
}
