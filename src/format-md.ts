#!/usr/bin/env node
import 'dotenv/config';
import { run } from './format-md/index.ts';

run().catch((error: Error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
