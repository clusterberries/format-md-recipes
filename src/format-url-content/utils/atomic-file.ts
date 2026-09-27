import { randomUUID } from 'node:crypto';
import { link, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Publish a complete file; exclusive mode never replaces an existing file. */
export async function writeFileAtomically(
  destination: string,
  content: string | Buffer,
  exclusive = false,
): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = path.join(
    path.dirname(destination),
    `.recipe-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    if (exclusive) await link(temporary, destination);
    else await rename(temporary, destination);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
