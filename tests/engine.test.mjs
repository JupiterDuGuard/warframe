// node --test tests/
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cases, makeContext, DATA_FILES } from './cases.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
const loadTree = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? load(v) : loadTree(v)]));
const ctx = makeContext(loadTree(DATA_FILES));

for (const c of cases) test(c.name, () => c.run(ctx));
