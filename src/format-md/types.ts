export type Complexity = 'simple' | 'moderate' | 'complex';

export interface ClassificationResult {
  isRecipe: boolean;
  complexity: Complexity;
  reason: string;
}

export interface CliOptions {
  inputPath: string;
  output: string | null;
  dest: string | null;
  rewrite: boolean;
  formattedPrefix: boolean;
  dryRun: boolean;
}