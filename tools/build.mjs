import { build } from "esbuild";
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
const result = await build({
    write: !check,
    entryPoints: ["packages/frontend/src/admin.ts"],
    bundle: true,
    format: "esm",
    target: "es2022",
    outdir: "packages/frontend/dist",
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
if (check) {
    for (const file of result.outputFiles) {
        const current = await readFile(file.path).catch(() => null);
        if (!current?.equals(file.contents))
            throw new Error(`Stale ${path.relative(process.cwd(), file.path)}: run npm run build and commit dist with the source`);
    }
} else if (execFileSync("git", ["status", "--porcelain", "packages/frontend/dist"], { encoding: "utf8" }))
    console.log("packages/frontend/dist changed: commit it together with the frontend source.");
