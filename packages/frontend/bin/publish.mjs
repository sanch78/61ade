#!/usr/bin/env node
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const target = process.argv[2];
if (!target) throw new Error("Usage: 61de-assets <public-assets-directory>");
await mkdir(target, { recursive: true });
for (const name of ["admin.js", "admin.css"]) {
    await copyFile(
        new URL(`../dist/${name}`, import.meta.url),
        path.join(target, name),
    );
}
console.log(`61de assets: ${path.resolve(target)}`);
