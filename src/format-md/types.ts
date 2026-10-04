export interface CliOptions {
  inputPath: string;
  output: string | null;
  dest: string | null;
  rewrite: boolean;
  formattedPrefix: boolean;
  dryRun: boolean;
}
