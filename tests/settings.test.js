const test = require("node:test");
const assert = require("node:assert/strict");

const settings = require("../settings.js");

test("defaults point at OpenRouter with the auto model", () => {
  const normalized = settings.normalize({
    provider: "unexpected",
    aiApiKey: "  example-key  ",
    aiBaseUrl: "https://api.example.com/v1",
    aiModel: "",
    supadataApiKey: "  example-supadata  ",
  });

  assert.equal(normalized.provider, "openrouter");
  assert.equal(normalized.aiModel, "auto");
  assert.equal(normalized.aiApiKey, "example-key");
  assert.equal(normalized.supadataApiKey, "example-supadata");
  // A stale base URL in storage must not survive: the registry owns endpoints.
  assert.equal(Object.hasOwn(normalized, "aiBaseUrl"), false);
});

test("every provider exposes a model list and chat endpoint", () => {
  for (const id of settings.PROVIDER_IDS) {
    const normalized = settings.normalize({ provider: id });
    assert.equal(normalized.provider, id);
    assert.match(settings.modelsUrl(normalized), /\/models$/);
    assert.match(settings.chatCompletionsUrl(normalized), /\/chat\/completions$/);
  }
  assert.equal(settings.PROVIDER_IDS.length, 3);
});

test("auto resolves to each provider's own router alias", () => {
  assert.equal(
    settings.resolveModel(settings.normalize({ provider: "openrouter" })),
    "openrouter/free",
  );
  assert.equal(
    settings.resolveModel(settings.normalize({ provider: "kilo" })),
    "kilo-auto/free",
  );
  // Hermes has no router alias; the caller picks the first free model.
  assert.equal(
    settings.resolveModel(settings.normalize({ provider: "hermes" })),
    settings.AUTO_MODEL,
  );
  assert.equal(
    settings.resolveModel(
      settings.normalize({ provider: "kilo", aiModel: "liquid/lfm-2.5-2.6b:free" }),
    ),
    "liquid/lfm-2.5-2.6b:free",
  );
});

test("only OpenRouter requires a key", () => {
  assert.equal(
    settings.hasAiCredentials(settings.normalize({ provider: "openrouter" })),
    false,
  );
  assert.equal(
    settings.hasAiCredentials(
      settings.normalize({ provider: "openrouter", aiApiKey: "k" }),
    ),
    true,
  );
  assert.equal(
    settings.hasAiCredentials(settings.normalize({ provider: "hermes" })),
    true,
  );
  assert.equal(
    settings.hasAiCredentials(settings.normalize({ provider: "kilo" })),
    true,
  );
});

test("auth headers follow the provider's auth mode", () => {
  const openrouter = settings.normalize({ provider: "openrouter", aiApiKey: "or" });
  assert.deepEqual(settings.authHeaders(openrouter), {
    Authorization: "Bearer or",
  });

  const kiloAnon = settings.normalize({ provider: "kilo" });
  assert.deepEqual(settings.authHeaders(kiloAnon), {});
  const kiloKey = settings.normalize({ provider: "kilo", kiloApiKey: "kl" });
  assert.deepEqual(settings.authHeaders(kiloKey), {
    Authorization: "Bearer kl",
  });

  // The proxy replaces any bearer with the real OAuth credential.
  const hermes = settings.normalize({ provider: "hermes" });
  assert.match(settings.authHeaders(hermes).Authorization, /^Bearer /);
});

test("legacy custom migration clears only the AI key and is idempotent", () => {
  const legacy = {
    provider: "custom",
    aiApiKey: "custom-secret",
    aiBaseUrl: "https://api.example.com/v1",
    aiModel: "example-model",
    supadataApiKey: " supadata-secret ",
  };
  const first = settings.migrateLegacyCustom(legacy);

  assert.equal(first.migrated, true);
  assert.equal(first.settings.provider, "openrouter");
  assert.equal(first.settings.aiModel, settings.DEFAULTS.aiModel);
  assert.equal(first.settings.aiApiKey, "");
  assert.equal(first.settings.supadataApiKey, "supadata-secret");

  const second = settings.migrateLegacyCustom(first.settings);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.settings, first.settings);

  const configured = settings.normalize({
    ...first.settings,
    aiApiKey: "new-key",
  });
  assert.equal(configured.aiApiKey, "new-key");
});

test("Supadata receives a canonical YouTube URL", () => {
  assert.equal(
    settings.canonicalYouTubeUrl("ydTeb_I0b94"),
    "https://www.youtube.com/watch?v=ydTeb_I0b94",
  );
  assert.throws(
    () => settings.canonicalYouTubeUrl('"><script>'),
    /Invalid YouTube video ID/,
  );
});
