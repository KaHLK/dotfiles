#!/usr/bin/env bun
/// <reference types="bun-types" />

const Reset = "\x1b[0m";
enum Colors {
    black = 0,
    red = 1,
    green = 2,
    yellow = 3,
    blue = 4,
    magenta = 5,
    cyan = 6,
    white = 7,
}

function color(
    color: Colors,
    options: { bg?: boolean; bright?: boolean } = {},
): (text?: string) => string {
    const c =
        "\x1b[" +
        (color + (options.bright ? 90 : 30) + (options.bg ? 10 : 0)) +
        "m";
    return function (text = "") {
        return c + text + Reset;
    };
}

function eightbit(
    color: number,
    options: { bg?: boolean } = {},
): (text?: string) => string {
    const c = "\x1b[" + (options.bg ? 48 : 38) + ";5;" + color + "m";
    return function (text = "") {
        return c + text + Reset;
    };
}

const size = 256 / 6;
function rgb(
    r: number,
    g: number,
    b: number,
    options: { bg?: boolean } = {},
): (text?: string) => string {
    const c =
        "\x1b[" + (options.bg ? 48 : 38) + ";2;" + r + ";" + g + ";" + b + "m";
    return function (text = "") {
        return c + text + Reset;
    };
}

const proc = Bun.spawn(["system_profiler", "SPSoftwareDataType"]);

const output = await new Response(proc.stdout).text();

const lines = output.split("\n").filter((v) => v.length > 0);
const values: Partial<{
    version: string;
    kernel: string;
    host: string;
    user: string;
    uptime: string;
}> = {};
for (const line of lines) {
    if (line.includes("System Version")) {
        values.version = line.split(":").at(1)?.trim();
    } else if (line.includes("Kernel Version")) {
        values.kernel = line.split(":").at(1)?.trim();
    } else if (line.includes("Computer Name")) {
        values.host = line.split(":").at(1)?.trim();
    } else if (line.includes("User Name")) {
        values.user = line.split("(").at(1)?.replace(")", "").trim();
    } else if (line.includes("Time since boot")) {
        values.uptime = line.split(":").at(1)?.trim();
    }
}

const green = color(Colors.green);
const out = `
  System: ${green(values.version)}
  Kernel: ${green(values.kernel)}
  Host:   ${rgb(0xff, 0xb3, 0xba)(values.user)}@${color(Colors.cyan)(
    values.host,
)}

  Uptime: ${green(values.uptime)}

`;
Bun.write(Bun.stdout, out);
