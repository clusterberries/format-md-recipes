import path from 'path';
import fs from 'fs/promises';
import { collectMarkdownFiles, getOutputPath, readFile, writeFile } from './file-utils.ts';
import { buildPrompt, buildScoutPrompt } from './prompt-builder.ts';
import { callOpenAI } from './openai-client.ts';
import { buildFormattingPlan, parseClassificationResult } from './model-routing.ts';
import { MINI_MODEL } from './constants.ts';
import type { CliOptions } from './types.ts';

function logWarning(message: string) {
  const yellow = '\u001b[33m';
  const reset = '\u001b[0m';
  console.warn(`⚠️  ${yellow}Warning:${reset} ${message}`);
}

function getPrefixedOutputPath(inputPath: string) {
  return path.join(
    path.dirname(inputPath),
    `formatted-${path.basename(inputPath)}`,
  );
}

async function formatSingleFile(
  inputPath: string,
  outputPath: string | null,
  dryRun: boolean,
) {
  const inputText = await readFile(inputPath);
  let formatted = '';

  if (!inputText || inputText.trim() === '') {
    logWarning(`Input file is empty: ${inputPath}.`);
    formatted = '';
  } else {
    const scoutPrompt = buildScoutPrompt(inputText);
    const scoutResult = await callOpenAI(scoutPrompt, MINI_MODEL);
    const classification = parseClassificationResult(scoutResult);
    const plan = buildFormattingPlan(classification);

    if (dryRun) {
      console.log(`\n=== Dry run scout result for ${inputPath} ===`);
      console.log(scoutResult + '\n');
    } else {
      console.log(
        `Formatting file: ${inputPath} using model ${plan.model} (isRecipe: ${plan.isRecipe})`,
      );
      const prompt = buildPrompt(inputText, plan.isRecipe);
      formatted = await callOpenAI(prompt, plan.model);
    }

    if (formatted === '') {
      logWarning(`OpenAI returned no content for ${inputPath}.`);
    }
  }

  if (dryRun) {
    console.log(`\n=== Dry run preview: ${inputPath} ===\n`);
    return null;
  }

  if (outputPath) {
    await writeFile(outputPath, formatted);
    return outputPath;
  }

  process.stdout.write(formatted + '\n');
  return null;
}

export async function runFormatter(options: CliOptions) {
  const { inputPath, output, dest, rewrite, formattedPrefix, dryRun } = options;

  if (!path.isAbsolute(inputPath)) {
    throw new Error(`Input path must be absolute: ${inputPath}`);
  }

  const stats = await fs.stat(inputPath);
  const isDirectory = stats.isDirectory();

  if (isDirectory) {
    if (!rewrite && !dest && !formattedPrefix) {
      throw new Error(
        'When input is a directory, --dest <folder> is required unless --rewrite or --formatted-prefix is used.',
      );
    }

    const markdownFiles = await collectMarkdownFiles(inputPath);
    if (markdownFiles.length === 0) {
      console.log(`No markdown files found in ${inputPath}`);
      return;
    }

    console.log(
      `${dryRun ? 'Dry run: ' : ''}Processing ${markdownFiles.length} markdown file(s) from ${inputPath}.`,
    );

    const writtenFiles = [];
    let index = 0;
    for (const filePath of markdownFiles) {
      index += 1;
      const outputPath = rewrite
        ? filePath
        : formattedPrefix
          ? getPrefixedOutputPath(filePath)
          : getOutputPath(filePath, inputPath, dest ?? '');

      const relativeInputPath = path.relative(inputPath, filePath);
      const relativeOutputPath = outputPath
        ? path.relative(inputPath, outputPath)
        : null;
      const progressMessage = dryRun
        ? `Dry run ${index}/${markdownFiles.length}: ${relativeInputPath}`
        : rewrite
          ? `Rewriting ${index}/${markdownFiles.length}: ${relativeInputPath}`
          : `Formatting ${index}/${markdownFiles.length}: ${relativeInputPath} -> ${relativeOutputPath}`;

      console.log(progressMessage);

      let written;
      try {
        written = await formatSingleFile(filePath, outputPath, dryRun);
      } catch (error: any) {
        throw new Error(`Error formatting ${filePath}: ${error.message}`);
      }

      if (written) {
        writtenFiles.push(written);
      }
    }

    if (!dryRun) {
      if (rewrite) {
        console.log(
          `✅ Rewrote ${writtenFiles.length} markdown file(s) in place.`,
        );
      } else if (formattedPrefix) {
        console.log(
          `✅ Formatted ${writtenFiles.length} markdown file(s) with prefix formatted- in ${inputPath}`,
        );
      } else {
        console.log(
          `✅ Formatted ${writtenFiles.length} markdown file(s) to ${dest}`,
        );
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

    let written;
    try {
      written = await formatSingleFile(inputPath, outputPath, dryRun);
    } catch (error: any) {
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
