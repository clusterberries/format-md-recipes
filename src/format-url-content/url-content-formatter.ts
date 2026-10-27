import { logWarning, logInfo, logProgress } from './logger.ts';
import { parseRecipePage } from './parser/page-parser.ts';
import type { RecipeDecision } from './recipe-decision.ts';
import type { ParsedRecipePage } from './types.ts';
import { writeFileAtomically } from './utils/atomic-file.ts';
import {
  buildSourceLink,
  createRenderPlan,
  joinNote,
  renderBody,
  renderNote,
  type RenderedNote,
  type RenderPlan,
} from './note-renderer.ts';
import { decideRecipe, logDecision } from './recipe-decision.ts';
import type { CliOptions } from './types.ts';

/** Saves a rendered note under a name derived from `title`; returns the note that was written. */
export type SaveResult = (
  title: string,
  render: (output: string) => Promise<RenderedNote>,
) => Promise<RenderedNote>;

export interface FormatResult {
  imageFailures: number;
}

export async function runUrlContentFormatter(
  options: CliOptions,
  saveResult?: SaveResult,
): Promise<FormatResult> {
  const { inputUrl } = options;

  try {
    if (options.downloadImages && !options.output && !saveResult) {
      throw new Error('Downloading images requires an output path.');
    }

    const page = await parseRecipePage(inputUrl);
    const decision = await decideRecipe(page, options.noAi);
    logDecision(decision, options.mainImageOnly);

    const plan = createRenderPlan(page, decision, options.mainImageOnly);
    const body = renderBody(plan);
    if (!body) {
      if (saveResult) throw new Error('No content or recipe found.');
      logWarning(`No content or recipe found for ${inputUrl}.`);
      return { imageFailures: 0 };
    }

    const sourceLink = buildSourceLink(decision.recipe);
    const render = (output: string) =>
      renderNote(plan, options, sourceLink, output);

    if (saveResult) {
      const saved = await saveResult(getNoteTitle(plan), render);
      return { imageFailures: saved.imageFailures };
    }

    if (options.output) {
      const note = await render(options.output);
      await saveNoteFile(options.output, note.markdown);
      return { imageFailures: note.imageFailures };
    }

    printDiagnostics(page, decision, joinNote(body, sourceLink));
    return { imageFailures: 0 };
  } catch (error) {
    throw new Error(
      `Error formatting ${inputUrl}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function getNoteTitle({ mode, page, recipe }: RenderPlan): string {
  return (
    (mode === 'structured'
      ? recipe.title.value
      : page.article?.title || recipe.title.value) ?? ''
  );
}

async function saveNoteFile(output: string, markdown: string): Promise<void> {
  await writeFileAtomically(output, markdown);
  logProgress(`Saved to ${output}`);
}

/** Without an output path the extraction details are printed as JSON for inspection. */
function printDiagnostics(
  page: ParsedRecipePage,
  decision: RecipeDecision,
  markdown: string,
): void {
  logInfo('Diagnostic JSON sent to stdout.');
  process.stdout.write(
    `${JSON.stringify(
      {
        recipe: page.recipe,
        title: page.article?.title ?? null,
        excerpt: page.article?.excerpt ?? null,
        images: page.sources.images,
        candidates: page.sources.candidates,
        normalizedRecipe: page.normalizedRecipe,
        reconciledRecipe: decision.recipe,
        ai: decision.aiResult,
        fallback: decision.mode !== 'structured',
        content: markdown ? `${markdown.slice(0, 100)}...` : null,
      },
      null,
      2,
    )}\n`,
  );
}
