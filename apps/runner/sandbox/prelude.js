// JavaScript answers use readline() and console.log(), the same as the in-browser Run button.
const fs = require("node:fs");

const input = fs.readFileSync(0, "utf8");
const lines = input.replace(/\r\n?/g, "\n").split("\n");
let next = 0;
const print = (...args) =>
  process.stdout.write(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n");

globalThis.readline = () => (next < lines.length ? lines[next++] : null);
globalThis.input = input;
globalThis.print = print;
console.log = print;
console.info = print;

require(process.argv[2]);
