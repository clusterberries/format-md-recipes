#!/usr/bin/env node
import dotenv from 'dotenv';
import { run } from './format-md/index.ts';

dotenv.config();

run().catch((error: Error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
