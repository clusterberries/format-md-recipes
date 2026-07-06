import fs from 'fs/promises';
import path from 'path';
import { existsSync, statSync } from 'fs';

export function pathExists(filePath: string) {
  return existsSync(filePath);
}

export function isDirectory(filePath: string) {
  return statSync(filePath).isDirectory();
}

export async function collectMarkdownFiles(
  directory: string,
): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

export function getOutputPath(
  inputFile: string,
  inputBase: string,
  destFolder: string,
) {
  const relativePath = path.relative(inputBase, inputFile);
  return path.resolve(destFolder, relativePath);
}

export async function ensureDirectoryExists(directory: string) {
  await fs.mkdir(directory, { recursive: true });
}

export async function readFile(filePath: string) {
  return fs.readFile(filePath, 'utf8');
}

export async function writeFile(filePath: string, content: string) {
  await ensureDirectoryExists(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}
