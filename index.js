#!/usr/bin/env node
import dotenv from 'dotenv';
import { run } from './src/index.js';

dotenv.config();

run().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
