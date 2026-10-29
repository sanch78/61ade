#!/usr/bin/env node
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const target = process.argv[2];
if (!target) throw new Error("Usage: 61ade-assets <public-assets-directory>");
await mkdir(target, { recursive: true });
// The runtime files; admin.d.ts is for development only.
for (const name of ["admin.js", "admin.css", "sandbox.html", "sandbox.js"]) {
    await copyFile(
        new URL(`../dist/${name}`, import.meta.url),
        path.join(target, name),
    );
}
console.log(`61ade assets: ${path.resolve(target)}`);
