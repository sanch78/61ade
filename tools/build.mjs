import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const cache = path.resolve(process.env.VAPA_TMP_DIR || "codex/tmp", "dhx-icons");
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
await build({
    entryPoints: ["packages/frontend/src/admin.ts"],
    bundle: true,
    format: "esm",
    target: "es2022",
    outdir: "packages/frontend/dist",
    minify: true,
    legalComments: "eof",
    loader: { ".woff": "dataurl", ".woff2": "dataurl" },
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
