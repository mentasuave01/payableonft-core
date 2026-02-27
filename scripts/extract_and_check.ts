
import { keccak256, toBytes } from "viem";
import { readFileSync } from "fs";

const content = readFileSync("lz_errors.txt", "utf-8");
const regex = /error\s+([a-zA-Z0-9_]+)\(([^)]*)\)/g;

console.log("Searching for 0xe5eb8f30...");

let match;
const seen = new Set();

while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const argsRaw = match[2];

    // canonicalize args: remove names, keep types, remove spaces
    const args = argsRaw.split(',').map(arg => {
        arg = arg.trim();
        if (!arg) return "";
        // Extract type (first word)
        // e.g. "uint256 amount" -> "uint256"
        // "ECDSA.RecoverError error" -> "ECDSA.RecoverError" (but wait, canonical solidity doesn't use struct/enum names in selector usually, but for Enums it uses uint8, for errors it might be complex)
        // However, most errors here use simple types.
        const parts = arg.split(/\s+/);
        return parts[0];
    }).filter(x => x).join(',');

    const signature = `${name}(${args})`;

    if (seen.has(signature)) continue;
    seen.add(signature);

    const hash = keccak256(toBytes(signature));
    const selector = hash.slice(0, 10);

    if (selector === "0xe5eb8f30") {
        console.log(`MATCH FOUND: ${signature} -> ${selector}`);
    }
}
