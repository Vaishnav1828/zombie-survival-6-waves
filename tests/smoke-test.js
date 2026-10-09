"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const game = fs.readFileSync(path.join(root, "src/game.js"), "utf8");
const css = fs.readFileSync(path.join(root, "src/style.css"), "utf8");

new vm.Script(game, { filename: "src/game.js" });
console.log("✓ Game JavaScript parses successfully");

for (const asset of ["src/game.js", "src/style.css"]) {
  assert.ok(fs.existsSync(path.join(root, asset)), "Missing asset: " + asset);
  assert.ok(html.includes(asset), "index.html does not load " + asset);
}
console.log("✓ HTML asset paths exist");

const requiredIds = [...game.matchAll(/\$\("([^"]+)"\)/g)].map(match => match[1]);
const htmlIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const id of requiredIds) assert.ok(htmlIds.has(id), "Game references missing HTML id: " + id);
console.log("✓ Game UI selectors exist in index.html");

for (const state of ["MENU", "PLAYING", "PAUSED", "GAME_OVER", "VICTORY"]) {
  assert.ok(game.includes(state + ':"' + state + '"'), "Missing game state: " + state);
}
assert.ok(game.includes("if(state!==State.PLAYING)return;"), "Simulation must stop outside PLAYING state");
console.log("✓ Explicit game states and pause guard exist");

const waveLine = game.split("\n").find(line => line.includes("function wavePlan(n)"));
assert.ok(waveLine, "wavePlan(n) is missing");
const fnText = waveLine.slice(waveLine.indexOf("function wavePlan"), waveLine.lastIndexOf("}") + 1);
const wavePlan = vm.runInNewContext("(" + fnText + ")");
const plans = [1,2,3,4,5,6].map(wavePlan);
assert.deepEqual(plans.map(plan => plan.count), [5,9,13,17,21,25]);
for (let i=1;i<plans.length;i++) {
  assert.ok(plans[i].speed > plans[i-1].speed, "Enemy speed should increase by wave");
  assert.ok(plans[i].health >= plans[i-1].health, "Enemy health should not decrease by wave");
}
assert.equal(plans[0].ranged, 0);
assert.ok(plans[2].ranged > 0, "Ranged enemies should be introduced by wave 3");
console.log("✓ Six-wave plan scales count, speed, health, and ranged mix");

for (const pool of ["enemyPool", "bulletPool", "particlePool"]) assert.ok(game.includes(pool), "Missing object pool: " + pool);
assert.ok(game.includes('e.type==="chaser"') && game.includes('e.type==="ranged"'), "Expected distinct zombie classes");
console.log("✓ Enemy classes and reusable object pools are present");

assert.ok(game.includes("AudioContext") && game.includes("function sfx(kind)"), "Procedural audio system is missing");
assert.ok(game.includes('localStorage.setItem("afterdarkBest"'), "Persistent best score write is missing");
assert.ok(css.includes("@media(max-width:740px)"), "Responsive layout rules are missing");
console.log("✓ Audio, persistent score, and responsive styles are present");

console.log("\nAll smoke tests passed.");
