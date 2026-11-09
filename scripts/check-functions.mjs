import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
async function load(name) {
  const root = resolve(`.vercel/output/functions/api/${name}.func`);
  const config = JSON.parse(
    await readFile(resolve(root, ".vc-config.json"), "utf8"),
  );
  return import(pathToFileURL(resolve(root, config.handler)).href);
}
const [owner, manage, catalog] = await Promise.all(
  ["owner", "manage", "catalog"].map(load),
);
const request = new Request("https://platform-hub.example.com/api/owner");
assert.equal(typeof catalog.GET, "function");
assert.deepEqual(await (await owner.GET(request)).json(), { isOwner: false });
assert.equal((await manage.GET(request)).status, 401);
assert.equal(
  (
    await manage.POST(
      new Request(request, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "publish",
          revision: "initial",
          catalog: { categories: [], tools: [] },
        }),
      }),
    )
  ).status,
  401,
);
console.log(
  "All compiled Platform Hub APIs boot; anonymous management is blocked.",
);
