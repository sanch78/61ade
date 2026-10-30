import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'examples/demo-app/public/website');
const check = process.argv.includes('--check');
const result = await build({
    absWorkingDir: root,
    entryPoints: ['examples/demo-app/website/site.js'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    outdir: path.join(output, 'assets'),
    write: false,
    legalComments: 'eof',
});
const files = result.outputFiles.map(file => [file.path, file.contents]);
for (const language of ['en', 'hu']) {
    const html = execFileSync(process.env.BLADE_PHP || 'php8.4', [path.join(root, 'examples/demo-app/website/page.php'), language]);
    files.push([path.join(output, language === 'hu' ? 'hu/index.html' : 'index.html'), html]);
}
for (const [source, target] of [['blade-logo-dark.svg', 'logo.svg'], ['blade-mark.svg', 'mark.svg']]) {
    files.push([path.join(output, 'assets', target), await readFile(path.join(root, 'packages/frontend/brand', source))]);
}
for (const [file, bytes] of files) {
    if (check) {
        const current = await readFile(file).catch(() => null);
        if (!current?.equals(Buffer.from(bytes))) throw new Error(`Stale ${path.relative(root, file)}: run npm run website:assets`);
    } else {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, bytes);
    }
}
console.log(check ? 'Website assets match their sources.' : 'Website prepared at https://61ade.sanch.hu/website/ (EN) and /website/hu/ (HU).');
