#!/usr/bin/env bun
/// <reference types="bun-types" />

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { $ } from "bun";

const TARGET = join(homedir(), ".llm-output");
const DAY_MS = 24 * 60 * 60 * 1000;

async function entrySize(path: string): Promise<number> {
    const info = await stat(path);
    if (!info.isDirectory()) return info.size;
    let total = 0;
    const children = await readdir(path);
    for (const child of children) {
        total += await entrySize(join(path, child));
    }
    return total;
}

function formatSize(bytes: number): string {
    const units = ["B", "K", "M", "G", "T"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n.toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}

let names: string[];
try {
    names = await readdir(TARGET);
} catch (err) {
    console.error(`Cannot read ${TARGET}: ${(err as Error).message}`);
    process.exit(1);
}

const entries: { path: string; ageDays: number; size: number }[] = [];
for (const name of names) {
    const path = join(TARGET, name);
    const info = await stat(path);
    entries.push({
        path,
        ageDays: (Date.now() - info.mtimeMs) / DAY_MS,
        size: await entrySize(path),
    });
}

if (entries.length === 0) {
    console.log(`${TARGET} is empty.`);
    process.exit(0);
}

const buckets: { label: string; min: number; max: number }[] = [
    { label: "90d+", min: 90, max: Infinity },
    { label: "30-90d", min: 30, max: 90 },
    { label: "7-30d", min: 7, max: 30 },
    { label: "1-7d", min: 1, max: 7 },
    { label: "<1d", min: 0, max: 1 },
];

console.log(`Age distribution in ${TARGET}:`);
for (const b of buckets) {
    const inBucket = entries.filter(
        (e) => e.ageDays >= b.min && e.ageDays < b.max,
    );
    const size = inBucket.reduce((sum, e) => sum + e.size, 0);
    console.log(
        `  ${b.label.padEnd(7)} ${String(inBucket.length).padStart(4)}  ${formatSize(size)}`,
    );
}
const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
console.log(
    `  ${"total".padEnd(7)} ${String(entries.length).padStart(4)}  ${formatSize(totalSize)}`,
);

const answer = prompt("Keep entries modified within last how many days?", "7");
const days = Number(answer);
if (!Number.isFinite(days) || days < 0) {
    console.error(`Invalid number: ${answer}`);
    process.exit(1);
}

const toDelete = entries.filter((e) => e.ageDays >= days);

if (toDelete.length === 0) {
    console.log(`Nothing older than ${days} days.`);
    process.exit(0);
}

const deleteSize = toDelete.reduce((sum, e) => sum + e.size, 0);
console.log(
    `\nWill delete ${toDelete.length} entries (${formatSize(deleteSize)}) older than ${days} days:`,
);
for (const e of toDelete) {
    console.log(`  ${formatSize(e.size).padStart(7)}  ${e.path}`);
}

const confirm = prompt("Proceed? [y/N]", "N");
if (confirm?.toLowerCase() !== "y") {
    console.log("Aborted.");
    process.exit(0);
}

const paths = toDelete.map((e) => e.path);
const { exitCode } = await $`rip ${paths}`.nothrow();
if (exitCode !== 0) {
    console.error(`rip exited with code ${exitCode}.`);
    process.exit(exitCode);
}
console.log(
    `Deleted ${toDelete.length} entries (${formatSize(deleteSize)}).`,
);
