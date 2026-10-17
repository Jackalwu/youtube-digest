/**
 * Free-model discovery and short-lived availability state.
 *
 * All three supported providers return OpenRouter's model-list shape:
 * `{ data: [{ id, name, context_length, pricing: { prompt, completion },
 * supported_parameters: [] }] }`. One parser therefore covers OpenRouter, the
 * Hermes proxy, and Kilo Gateway.
 *
 * The list is cached briefly and re-fetched when the cache expires, when the
 * side panel opens, or when the user presses Refresh. Rate-limit state is kept
 * separately so the picker can mark a model that just answered 429.
 */
var YTD_MODELS = (() => {
  const CACHE_KEY = "ytd_models_cache";
  const STATUS_KEY = "ytd_model_status";
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const DEFAULT_COOLDOWN_MS = 60 * 1000;

  function isFreeModel(model) {
    const id = typeof model?.id === "string" ? model.id : "";
    if (!id) return false;
    const pricing = model.pricing || {};
    const hasPricing =
      pricing.prompt !== undefined && pricing.completion !== undefined;
    if (hasPricing) {
      return Number(pricing.prompt) === 0 && Number(pricing.completion) === 0;
    }
    // Router aliases such as `kilo-auto/free` may omit pricing.
    return id.endsWith(":free") || id.endsWith("/free");
  }

  /**
   * Some free entries are not chat models: Kilo lists music generators such as
   * `google/lyria-3-*` at $0, and picking one would break translation. Require
   * text input and text-only output when the payload declares modalities.
   */
  function isChatModel(model) {
    const architecture = model?.architecture;
    if (!architecture) return true;
    const input = architecture.input_modalities;
    const output = architecture.output_modalities;
    if (Array.isArray(input) && !input.includes("text")) return false;
    if (Array.isArray(output)) {
      return output.includes("text") && output.every((m) => m === "text");
    }
    return true;
  }

  function supportsJson(model) {
    const params = model?.supported_parameters;
    if (!Array.isArray(params)) return false;
    return (
      params.includes("response_format") || params.includes("structured_outputs")
    );
  }

  function toEntry(model) {
    return {
      id: model.id,
      name: typeof model.name === "string" && model.name ? model.name : model.id,
      contextLength: Number(model.context_length) || 0,
      supportsJson: supportsJson(model),
    };
  }

  /** Pure: turn a provider model-list payload into sorted free entries. */
  function parseFreeModels(payload) {
    const list = Array.isArray(payload?.data) ? payload.data : [];
    return list
      .filter((model) => isFreeModel(model) && isChatModel(model))
      .map(toEntry)
      .sort((a, b) => {
        if (b.contextLength !== a.contextLength) {
          return b.contextLength - a.contextLength;
        }
        return a.id.localeCompare(b.id);
      });
  }

  function storageArea() {
    return globalThis.chrome?.storage?.local;
  }

  async function readJson(key) {
    const area = storageArea();
    if (!area) return undefined;
    const stored = await area.get(key);
    return stored?.[key];
  }

  async function writeJson(key, value) {
    const area = storageArea();
    if (!area) return;
    await area.set({ [key]: value });
  }

  /**
   * @returns {Promise<{models: Array, fetchedAt: number, stale: boolean,
   *   error: string|null}>}
   */
  async function getFreeModels(settings, { force = false } = {}) {
    const providerId = settings.provider;
    const cache = await readJson(CACHE_KEY);
    const entry = cache?.[providerId];
    const fresh =
      entry &&
      Array.isArray(entry.models) &&
      Date.now() - entry.fetchedAt < CACHE_TTL_MS;

    if (fresh && !force) {
      return { ...entry, stale: false, error: null };
    }

    try {
      const response = await fetch(YTD_SETTINGS.modelsUrl(settings), {
        headers: YTD_SETTINGS.authHeaders(settings),
      });
      if (!response.ok) {
        throw new Error(`Model list request failed: ${response.status}`);
      }
      const payload = await response.json();
      const models = parseFreeModels(payload);
      const next = { models, fetchedAt: Date.now() };
      const merged = { ...(cache || {}), [providerId]: next };
      await writeJson(CACHE_KEY, merged);
      return { ...next, stale: false, error: null };
    } catch (error) {
      // Keep showing the last known list rather than an empty picker.
      if (entry && Array.isArray(entry.models)) {
        return { ...entry, stale: true, error: String(error.message || error) };
      }
      return {
        models: [],
        fetchedAt: 0,
        stale: true,
        error: String(error?.message || error),
      };
    }
  }

  async function getStatuses() {
    const statuses = (await readJson(STATUS_KEY)) || {};
    const now = Date.now();
    const live = {};
    for (const [key, value] of Object.entries(statuses)) {
      if (value && value.until > now) live[key] = value;
    }
    return live;
  }

  function statusKey(providerId, modelId) {
    return `${providerId}::${modelId}`;
  }

  /** Record that a model is rate-limited or gone, so the picker can say so. */
  async function markUnavailable(settings, modelId, reason, seconds) {
    const key = statusKey(settings.provider, modelId);
    const statuses = (await readJson(STATUS_KEY)) || {};
    const ttl = Number(seconds) > 0 ? Number(seconds) * 1000 : DEFAULT_COOLDOWN_MS;
    statuses[key] = { reason, until: Date.now() + ttl, at: Date.now() };
    await writeJson(STATUS_KEY, statuses);
    return statuses[key];
  }

  async function clearStatus(settings, modelId) {
    const key = statusKey(settings.provider, modelId);
    const statuses = (await readJson(STATUS_KEY)) || {};
    if (!(key in statuses)) return;
    delete statuses[key];
    await writeJson(STATUS_KEY, statuses);
  }

  return {
    CACHE_KEY,
    STATUS_KEY,
    CACHE_TTL_MS,
    isFreeModel,
    isChatModel,
    supportsJson,
    parseFreeModels,
    getFreeModels,
    getStatuses,
    statusKey,
    markUnavailable,
    clearStatus,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = YTD_MODELS;
}
