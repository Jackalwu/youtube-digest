/**
 * Shared, non-secret configuration helpers.
 *
 * API keys are stored in chrome.storage.local by options.js. This file contains
 * defaults, the provider registry, and validation only, so it is safe to
 * publish.
 *
 * Every supported provider speaks the same OpenAI-compatible surface and
 * returns the same model-list shape (OpenRouter's `data[]` schema), which is why
 * one discovery routine covers all three.
 */
var YTD_SETTINGS = (() => {
  const STORAGE_KEY = "ytd_settings";
  const AUTO_MODEL = "auto";

  const PROVIDERS = Object.freeze({
    openrouter: Object.freeze({
      id: "openrouter",
      label: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      // A key is required.
      auth: "key",
      keyField: "aiApiKey",
      autoModel: "openrouter/free",
      keyUrl: "https://openrouter.ai/api_keys",
    }),
    hermes: Object.freeze({
      id: "hermes",
      label: "Hermes proxy (Nous Portal)",
      baseUrl: "http://127.0.0.1:8645/v1",
      // `hermes proxy` attaches the real OAuth credentials; any bearer works.
      auth: "none",
      keyField: null,
      autoModel: AUTO_MODEL,
      healthUrl: "http://127.0.0.1:8645/health",
      startCommand: "hermes proxy start",
    }),
    kilo: Object.freeze({
      id: "kilo",
      label: "Kilo Gateway",
      baseUrl: "https://api.kilo.ai/api/openrouter/v1",
      // Anonymous calls work today; a key keeps the path stable.
      auth: "optional",
      keyField: "kiloApiKey",
      autoModel: "kilo-auto/free",
      keyUrl: "https://app.kilo.ai/profile",
    }),
  });

  const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

  const DEFAULTS = Object.freeze({
    provider: "openrouter",
    aiModel: AUTO_MODEL,
    aiApiKey: "",
    kiloApiKey: "",
    supadataApiKey: "",
  });

  function isLegacyCustom(input) {
    return !!input && input.provider === "custom";
  }

  function readString(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalize(input = {}) {
    const provider = PROVIDERS[input.provider]
      ? input.provider
      : DEFAULTS.provider;
    // A legacy custom provider's model belonged to that endpoint, so it is
    // dropped together with its key instead of being carried over.
    const model = isLegacyCustom(input) ? "" : readString(input.aiModel);
    return {
      provider,
      aiModel: model || DEFAULTS.aiModel,
      aiApiKey: isLegacyCustom(input) ? "" : readString(input.aiApiKey),
      kiloApiKey: readString(input.kiloApiKey),
      supadataApiKey: readString(input.supadataApiKey),
    };
  }

  function migrateLegacyCustom(input = {}) {
    return {
      settings: normalize(input),
      migrated: isLegacyCustom(input),
    };
  }

  function getProvider(settings) {
    const id = PROVIDERS[settings?.provider]
      ? settings.provider
      : DEFAULTS.provider;
    return PROVIDERS[id];
  }

  function providerLabel(id) {
    return PROVIDERS[id]?.label ?? id;
  }

  /**
   * True when the configured provider has everything it needs to send a
   * request. Hermes needs no key because the proxy owns the credentials.
   */
  function hasAiCredentials(settings) {
    const provider = getProvider(settings);
    if (provider.auth !== "key") return true;
    return !!readString(settings?.[provider.keyField]);
  }

  function resolveModel(settings) {
    const provider = getProvider(settings);
    const model = readString(settings?.aiModel) || DEFAULTS.aiModel;
    return model === AUTO_MODEL ? provider.autoModel : model;
  }

  function authHeaders(settings) {
    const provider = getProvider(settings);
    if (provider.auth === "none") {
      // The Hermes proxy replaces this value with the real OAuth bearer.
      return { Authorization: "Bearer hermes-proxy" };
    }
    const key = readString(settings?.[provider.keyField]);
    return key ? { Authorization: `Bearer ${key}` } : {};
  }

  function modelsUrl(settings) {
    return `${getProvider(settings).baseUrl}/models`;
  }

  function chatCompletionsUrl(settings) {
    return `${getProvider(settings).baseUrl}/chat/completions`;
  }

  function canonicalYouTubeUrl(videoId) {
    const normalized = String(videoId || "").trim();
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(normalized)) {
      throw new Error("Invalid YouTube video ID.");
    }
    return `https://www.youtube.com/watch?v=${normalized}`;
  }

  return {
    STORAGE_KEY,
    AUTO_MODEL,
    DEFAULTS,
    PROVIDERS,
    PROVIDER_IDS,
    isLegacyCustom,
    normalize,
    migrateLegacyCustom,
    getProvider,
    providerLabel,
    hasAiCredentials,
    resolveModel,
    authHeaders,
    modelsUrl,
    chatCompletionsUrl,
    canonicalYouTubeUrl,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = YTD_SETTINGS;
}
