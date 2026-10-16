import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
                    // The shell has no icon-font dependency or runtime CDN requests.
                    contents: (await readFile(args.path, "utf8")).replace(
                        /@import\s+url\([^)]*cdn\.dhtmlx\.com[^)]*\);?/g,
                        "",
                    ),
                    loader: "css",
                    resolveDir: path.dirname(args.path),
                }));
            },
        },
    ],
});
