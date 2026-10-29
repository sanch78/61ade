import { build } from "esbuild";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const cache = path.resolve(process.env.BLADE_TMP_DIR || "tmp", "dhx-icons");
await mkdir(cache, { recursive: true });
const assets = JSON.parse(
    await readFile(new URL("vendor-assets.json", import.meta.url), "utf8"),
);
for (const [name, { url, sha256 }] of Object.entries(assets)) {
    let bytes;
    try {
        bytes = await readFile(path.join(cache, name));
    } catch {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok)
            throw new Error(`Vendor asset download failed: ${name}`);
        bytes = Buffer.from(await response.arrayBuffer());
    }
    if (createHash("sha256").update(bytes).digest("hex") !== sha256)
        throw new Error(`Vendor asset integrity mismatch: ${name}`);
    await writeFile(path.join(cache, name), bytes);
}
// dist is tracked; --check fails when it does not match a fresh build of src.
const check = process.argv.includes("--check");
const dist = "packages/frontend/dist";
const result = await build({
    write: false,
    entryPoints: ["packages/frontend/src/admin.ts"],
    bundle: true,
    format: "esm",
    target: "es2022",
    outdir: dist,
    minify: true,
    legalComments: "eof",
    loader: { ".woff": "dataurl", ".woff2": "dataurl", ".png": "dataurl" },
    plugins: [
        {
            name: "local-vendor-css",
            setup(build) {
                build.onLoad({ filter: /suite\.min\.css$/ }, async (args) => ({
                    contents: (await readFile(args.path, "utf8")).replace(
                        /@import\s+url\([^)]*cdn\.dhtmlx\.com[^)]*\);?/g,
                        `@import "${path.join(cache, "dhx-icons.css")}";`,
                    ),
                    loader: "css",
                    resolveDir: path.dirname(args.path),
                }));
            },
        },
    ],
});
// SandboxFrame's document: a classic script (an opaque-origin frame cannot load module scripts without CORS),
// left readable for review, beside the static sandbox.html with its meta CSP.
const sandbox = await build({
    write: false,
    entryPoints: ["packages/frontend/src/sandbox/bootstrap.ts"],
    bundle: true,
    format: "iife",
    target: "es2022",
    outfile: `${dist}/sandbox.js`,
    legalComments: "eof",
});
// The WebSocket live server ships inside packages/php with ws inlined, so a consumer release
// that copies packages/php runs it with the system node and nothing from node_modules.
const live = await build({
    write: false,
    entryPoints: ["tools/live-server.mjs"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    outfile: "packages/php/bin/live-server.mjs",
    legalComments: "eof",
    // ws requires Node built-ins through CommonJS require; its optional native add-ons stay out.
    banner: { js: 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);' },
    footer: { js: "// Bundled ws: MIT License, Copyright (c) 2011 Einar Otto Stangvik and contributors, https://github.com/websockets/ws" },
    define: {
        "process.env.WS_NO_BUFFER_UTIL": '"1"',
        "process.env.WS_NO_UTF_8_VALIDATE": '"1"',
    },
});
// admin.d.ts (development only): tsc --emitDeclarationOnly of src/api/index.ts, whose only import is ./types,
// joined into one file so a project maps "@61ade/admin" to it.
const declarations = {};
{
    const base = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config.compilerOptions;
    const { options } = ts.convertCompilerOptionsFromJson({ ...base, declaration: true, emitDeclarationOnly: true, noEmit: false }, process.cwd());
    const program = ts.createProgram(["packages/frontend/src/api/index.ts"], options);
    const emitted = program.emit(undefined, (name, text) => { declarations[path.basename(name)] = text; }, undefined, true);
    const problems = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
    if (problems.length) throw new Error(ts.formatDiagnostics(problems, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
}
const index = (declarations["index.d.ts"] ?? "").split("\n").filter((line) => !/^(export type \* from|import type \{[^}]*\} from) "\.\/types";$/.test(line));
if (!declarations["types.d.ts"] || index.some((line) => /from "\.\//.test(line)))
    throw new Error("admin.d.ts: src/api/index.ts may only re-export ./types");
const outputs = [
    ...[...result.outputFiles, ...sandbox.outputFiles, ...live.outputFiles].map((file) => [file.path, Buffer.from(file.contents)]),
    [path.resolve(dist, "sandbox.html"), await readFile("packages/frontend/src/sandbox/sandbox.html")],
    [path.resolve(dist, "admin.d.ts"), Buffer.from(
        "// 61ade toolkit API types (docs/toolkit.md), generated from packages/frontend/src/api; development use only.\n"
        + declarations["types.d.ts"] + index.join("\n"),
    )],
];
if (check) {
    for (const [file, contents] of outputs) {
        const current = await readFile(file).catch(() => null);
        if (!current?.equals(contents))
            throw new Error(`Stale ${path.relative(process.cwd(), file)}: run npm run build and commit the output with the source`);
    }
} else {
    for (const [file, contents] of outputs) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, contents);
    }
    if (execFileSync("git", ["status", "--porcelain", "packages/frontend/dist", "packages/php/bin/live-server.mjs"], { encoding: "utf8" }))
        console.log("Build output changed: commit packages/frontend/dist and packages/php/bin/live-server.mjs together with their source.");
}
