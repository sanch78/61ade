import { build } from "esbuild";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
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
// dist and the demo module are tracked; --check fails when they do not match a fresh build of their sources.
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
    // `.svg` as text: the product logo (packages/frontend/brand) is inlined by the shell, never a deployed file.
    loader: { ".woff": "dataurl", ".woff2": "dataurl", ".png": "dataurl", ".svg": "text" },
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
// SandboxFrame's document: the bootstrap is a classic script (an opaque-origin frame cannot load module scripts without
// CORS), left readable for review and inlined into sandbox.html. Its meta CSP admits exactly that script by its hash
// plus blob: (the delivered code), so the untrusted code can load no same-origin script (docs/toolkit.md#sandbox-protocol).
const bootstrap = (await build({
    write: false,
    entryPoints: ["packages/frontend/src/sandbox/bootstrap.ts"],
    bundle: true,
    format: "iife",
    target: "es2022",
    legalComments: "eof",
})).outputFiles[0].text;
if (/<\/script|<!--/i.test(bootstrap))
    throw new Error("sandbox.html: the bootstrap contains </script or <!-- and cannot be inlined");
const sandboxTemplate = await readFile("packages/frontend/src/sandbox/sandbox.html", "utf8");
if (sandboxTemplate.split("{{bootstrap}}").length !== 2 || sandboxTemplate.split("{{bootstrap-hash}}").length !== 2)
    throw new Error("sandbox.html: the template needs one {{bootstrap}} and one {{bootstrap-hash}}");
const sandboxHtml = sandboxTemplate
    .replace("{{bootstrap-hash}}", "sha256-" + createHash("sha256").update(bootstrap, "utf8").digest("base64"))
    .replace("{{bootstrap}}", () => bootstrap);
// Former build outputs that must no longer exist (sandbox.js was inlined into sandbox.html).
const obsolete = [path.resolve(dist, "sandbox.js")];
// The feature demo's project module (docs/demos.md#toolkit-consumer), built like a consumer's (docs/toolkit.md#typescript-recipe):
// 61ade arrives only as types (`import type` from admin.d.ts) and `app`, so only the demo's own sources may be bundled.
// The CSS its sources import becomes demo.css beside demo.js, the stylesheet application.php declares.
const demoSource = path.resolve("examples/demo-app/frontend/src");
const demo = await build({
    write: false,
    entryPoints: [path.join(demoSource, "index.ts")],
    bundle: true,
    format: "esm",
    target: "es2022",
    outfile: "examples/demo-app/public/app/demo.js",
    legalComments: "eof",
    plugins: [
        {
            name: "demo-boundary",
            setup(build) {
                build.onResolve({ filter: /.*/ }, (args) => args.kind === "entry-point"
                    || (/^\.\.?\//.test(args.path) && path.resolve(args.resolveDir, args.path).startsWith(demoSource + path.sep))
                    ? undefined
                    : { errors: [{ text: `demo.js may bundle only examples/demo-app/frontend/src (use app.* and import type): ${args.path}` }] });
            },
        },
    ],
});
if (!demo.outputFiles.some((file) => file.path === path.resolve("examples/demo-app/public/app/demo.css")))
    throw new Error("demo.css: the feature demo declares app/demo.css; its sources must import their CSS");
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
// admin.d.ts (development only): tsc --emitDeclarationOnly of src/api/index.ts, whose only imports are ./types and
// ./sign-in (the sign-in modules' API), joined into one file so a project maps "@61ade/admin" to it.
const declarations = {};
{
    const base = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config.compilerOptions;
    const { options } = ts.convertCompilerOptionsFromJson({ ...base, declaration: true, emitDeclarationOnly: true, noEmit: false }, process.cwd());
    const program = ts.createProgram(["packages/frontend/src/api/index.ts"], options);
    const emitted = program.emit(undefined, (name, text) => { declarations[path.basename(name)] = text; }, undefined, true);
    const problems = [...ts.getPreEmitDiagnostics(program), ...emitted.diagnostics];
    if (problems.length) throw new Error(ts.formatDiagnostics(problems, { getCanonicalFileName: (name) => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => "\n" }));
}
const index = (declarations["index.d.ts"] ?? "").split("\n").filter((line) => !/^(export type \* from|import type \{[^}]*\} from) "\.\/(types|sign-in)";$/.test(line));
if (!declarations["types.d.ts"] || !declarations["sign-in.d.ts"] || /^import /m.test(declarations["sign-in.d.ts"]) || index.some((line) => /from "\.\//.test(line)))
    throw new Error("admin.d.ts: src/api/index.ts may only re-export ./types and the import-free ./sign-in");
const outputs = [
    ...[...result.outputFiles, ...demo.outputFiles, ...live.outputFiles].map((file) => [file.path, Buffer.from(file.contents)]),
    [path.resolve(dist, "sandbox.html"), Buffer.from(sandboxHtml)],
    [path.resolve(dist, "admin.d.ts"), Buffer.from(
        "// 61ade toolkit API types (docs/toolkit.md), generated from packages/frontend/src/api; development use only.\n"
        + declarations["types.d.ts"] + declarations["sign-in.d.ts"] + index.join("\n"),
    )],
];
if (check) {
    for (const [file, contents] of outputs) {
        const current = await readFile(file).catch(() => null);
        if (!current?.equals(contents))
            throw new Error(`Stale ${path.relative(process.cwd(), file)}: run npm run build and commit the output with the source`);
    }
    for (const file of obsolete)
        if (await readFile(file).then(() => true, () => false))
            throw new Error(`Obsolete ${path.relative(process.cwd(), file)}: run npm run build and commit its removal`);
} else {
    for (const [file, contents] of outputs) {
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, contents);
    }
    for (const file of obsolete) await rm(file, { force: true });
    if (execFileSync("git", ["status", "--porcelain", "packages/frontend/dist", "packages/php/bin/live-server.mjs", "examples/demo-app/public/app"], { encoding: "utf8" }))
        console.log("Build output changed: commit packages/frontend/dist, packages/php/bin/live-server.mjs and examples/demo-app/public/app/demo.js and demo.css together with their source.");
}
