const path = require('node:path');
const { defineConfig } = require('../../tools/playwright-test.cjs');

const root = path.resolve(__dirname, '../..');
// Host-local, Git-ignored settings (e.g. BLADE_DEMO_URL=https://demo.example.test): KEY=VALUE lines.
try {
    for (const line of require('node:fs').readFileSync(path.join(root, '.env.test'), 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
    }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
// Browser tests only run against the managed demo server; no local server is started.
if (!process.env.BLADE_DEMO_URL) throw new Error('Set BLADE_DEMO_URL (e.g. in .env.test) to the managed demo URL.');
const demoUrl = process.env.BLADE_DEMO_URL.replace(/\/+$/, '');
const runtime = path.resolve(root, process.env.BLADE_TMP_DIR || 'tmp');
process.env.BLADE_TMP_DIR = runtime;

module.exports = defineConfig({
    testDir: path.join(root, 'tests/shell'),
    workers: 1,
    outputDir: path.join(runtime, 'playwright-results'),
    reporter: 'list',
    use: { trace: 'retain-on-failure' },
    projects: [{ name: 'shell', testMatch: '*.spec.cjs', use: { baseURL: demoUrl } }],
});
