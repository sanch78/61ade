const path = require('node:path');
const { defineConfig } = require('../../tools/playwright-test.cjs');

const root = path.resolve(__dirname, '../..');
const runtime = path.resolve(root, process.env.VAPA_TMP_DIR || 'tmp');
// Absolute paths also keep fixture processes independent of the config location.
process.env.VAPA_TMP_DIR = runtime;
process.env.VAPA_TEST_AUTH_RUNTIME ||= path.join(runtime, 'auth-fixture');

const suites = [
    {
        name: 'shell', port: 8086, testMatch: '*.spec.cjs',
        testIgnore: ['i18n.spec.cjs', 'list-integration.spec.cjs', 'authentication.spec.cjs',
            'related-fields.spec.cjs', 'grid-edit.spec.cjs', 'grid-sort.spec.cjs'],
        command: 'tools/serve-demo.sh', reuseExistingServer: !process.env.CI,
    },
    { name: 'auth', port: 8090, testMatch: 'authentication.spec.cjs',
        command: 'node tests/fixtures/authentication/server.mjs' },
    { name: 'related', port: 8092, testMatch: 'related-fields.spec.cjs',
        router: 'related-fields', reuseExistingServer: !process.env.CI },
    { name: 'grid-edit', port: 8094, testMatch: 'grid-edit.spec.cjs', router: 'grid-edit',
        env: { VAPA_TMP_DIR: path.join(runtime, 'grid-edit-run-' + process.pid) } },
    { name: 'sorting', port: 8096, testMatch: 'grid-sort.spec.cjs',
        router: 'grid-sort', reuseExistingServer: !process.env.CI },
    { name: 'preferences', port: 8096, testMatch: 'preferences.test.cjs',
        router: 'grid-sort', reuseExistingServer: !process.env.CI },
    { name: 'presentation', port: 8098, testMatch: 'list-integration.spec.cjs',
        router: 'list-presentation', publicRoot: true, timeout: 45000, screenshot: 'only-on-failure' },
    { name: 'i18n', port: 8099, testMatch: 'i18n.spec.cjs',
        router: 'i18n', publicRoot: true, timeout: 60000, screenshot: 'only-on-failure' },
];

// Playwright filters projects itself; match the CLI selection for server startup too.
// Support repeated --project flags, either spelling, and Playwright's * wildcard.
const requested = [];
let collectingProjects = false;
for (const arg of process.argv.slice(2)) {
    if (arg === '--project') { collectingProjects = true; continue; }
    if (arg.startsWith('--project=')) {
        requested.push(arg.slice(10));
        collectingProjects = false;
        continue;
    }
    if (arg.startsWith('-')) collectingProjects = false;
    if (collectingProjects) requested.push(arg);
}
const patterns = requested.map(name => new RegExp('^' + String(name)
    .split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 'i'));
const listing = process.argv.includes('--list');
const selected = suites.filter(suite => patterns.length
    ? patterns.some(pattern => pattern.test(suite.name))
    : listing || suite.name === 'shell');
// Several fixture servers plus Chromium exceed the protected host's task limit.
// Keep the old shell default and require one suite per browser invocation.
if (!listing && selected.length !== 1) {
    throw new Error('Choose exactly one browser project per run with --project=<name>: '
        + suites.map(suite => suite.name).join(', ') + '. Use --list to discover all tests.');
}
const servers = [...new Map(selected.map(suite => [suite.port, suite])).values()];

module.exports = defineConfig({
    testDir: path.join(root, 'tests/shell'),
    workers: 1,
    outputDir: path.join(runtime, 'playwright-results'),
    reporter: 'list',
    use: { trace: 'retain-on-failure' },
    projects: suites.map(suite => ({
        name: suite.name,
        testMatch: suite.testMatch,
        ...(suite.testIgnore ? { testIgnore: suite.testIgnore } : {}),
        ...(suite.timeout ? { timeout: suite.timeout } : {}),
        use: { baseURL: `http://127.0.0.1:${suite.port}`,
            ...(suite.screenshot ? { screenshot: suite.screenshot } : {}) },
    })),
    webServer: servers.map(suite => ({
        cwd: root,
        command: suite.command || '${VAPA_PHP:-php8.4} -S 127.0.0.1:' + suite.port
            + (suite.publicRoot ? ' -t examples/demo-app/public' : '')
            + ` tests/fixtures/${suite.router}/router.php`,
        url: `http://127.0.0.1:${suite.port}`,
        reuseExistingServer: suite.reuseExistingServer || false,
        ...(suite.env ? { env: suite.env } : {}),
    })),
});
