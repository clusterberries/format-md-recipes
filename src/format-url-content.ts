#!/usr/bin/env node
import dotenv from 'dotenv';
import { run } from './format-url-content/index.ts';

dotenv.config();

run().catch((error: Error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
