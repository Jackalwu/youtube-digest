const test = require("node:test");
const assert = require("node:assert/strict");

const models = require("../models.js");

const payload = {
  data: [
    {
      id: "paid/model",
      name: "Paid Model",
      context_length: 999999,
      pricing: { prompt: "0.0000001", completion: "0.0000002" },
      supported_parameters: ["response_format"],
    },
    {
      id: "free/big:free",
      name: "Free Big",
      context_length: 524288,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["response_format", "tools"],
    },
    {
      id: "free/small:free",
      name: "Free Small",
      context_length: 65536,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
    },
    {
      // Router alias: no pricing object at all, still free.
      id: "kilo-auto/free",
      name: "Auto",
      context_length: 256000,
      supported_parameters: [],
    },
  ],
};

test("only zero-priced and router-alias models are listed", () => {
  const entries = models.parseFreeModels(payload);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["free/big:free", "kilo-auto/free", "free/small:free"],
  );
});

test("entries are sorted by context length, then id", () => {
  const entries = models.parseFreeModels(payload);
  const contexts = entries.map((entry) => entry.contextLength);
  assert.deepEqual(contexts, [...contexts].sort((a, b) => b - a));
});

test("JSON capability comes from supported_parameters", () => {
  const byId = Object.fromEntries(
    models.parseFreeModels(payload).map((entry) => [entry.id, entry]),
  );
  assert.equal(byId["free/big:free"].supportsJson, true);
  assert.equal(byId["free/small:free"].supportsJson, false);
  assert.equal(byId["kilo-auto/free"].supportsJson, false);
});

test("a model with no pricing is only free when its id says so", () => {
  assert.equal(models.isFreeModel({ id: "x/y" }), false);
  assert.equal(models.isFreeModel({ id: "x/y:free" }), true);
  assert.equal(models.isFreeModel({ id: "kilo-auto/free" }), true);
  assert.equal(models.isFreeModel({}), false);
});

test("malformed payloads yield an empty list", () => {
  assert.deepEqual(models.parseFreeModels(null), []);
  assert.deepEqual(models.parseFreeModels({ data: "nope" }), []);
});

test("status keys are namespaced per provider", () => {
  assert.equal(models.statusKey("kilo", "x/y"), "kilo::x/y");
  assert.notEqual(
    models.statusKey("kilo", "x/y"),
    models.statusKey("openrouter", "x/y"),
  );
});
