"use strict";

const crypto = require("crypto");

function assertString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function normalizeBaseUrl(value) {
  return assertString(value, "baseUrl").replace(/\/+$/, "");
}

function encodeBasicAuth(accessKey, secretKey) {
  return Buffer.from(`${accessKey}:${secretKey}`, "utf8").toString("base64");
}

function defaultTokenRequestBody(scope) {
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  if (scope) {
    params.set("scope", scope);
  }
  return params.toString();
}

function createMasterDataService(config = {}) {
  const serviceMap = new Map();
  const tokenCache = new Map();
  const services = Array.isArray(config.services) ? config.services : [];

  for (const service of services) {
    registerService(service);
  }

  function registerService(service) {
    const name = assertString(service.name, "service.name");
    serviceMap.set(name, {
      name,
      description:
        typeof service.description === "string" && service.description.trim()
          ? service.description.trim()
          : "",
      tokenUrl: normalizeBaseUrl(service.tokenUrl || `${normalizeBaseUrl(service.baseUrl)}/oauth/token`),
      apiUrl: normalizeBaseUrl(service.apiUrl || `${normalizeBaseUrl(service.baseUrl)}/api`),
      accessKey: assertString(service.accessKey, "service.accessKey"),
      secretKey: assertString(service.secretKey, "service.secretKey"),
      scope: typeof service.scope === "string" ? service.scope.trim() : "",
      tokenHeaders: service.tokenHeaders && typeof service.tokenHeaders === "object" ? service.tokenHeaders : {},
      apiHeaders: service.apiHeaders && typeof service.apiHeaders === "object" ? service.apiHeaders : {},
      tokenMethod: typeof service.tokenMethod === "string" ? service.tokenMethod.toUpperCase() : "POST",
      requestMethod: typeof service.requestMethod === "string" ? service.requestMethod.toUpperCase() : "POST",
      requestPath:
        typeof service.requestPath === "string" && service.requestPath.trim()
          ? service.requestPath.trim()
          : "/query",
    });
  }

  function listServices() {
    return Array.from(serviceMap.values()).map((service) => ({
      name: service.name,
      description: service.description,
      requestPath: service.requestPath,
    }));
  }

  function isExist(serviceName) {
    return serviceMap.has(String(serviceName || ""));
  }

  async function call(serviceName, payload = {}, options = {}) {
    const service = serviceMap.get(String(serviceName || ""));
    if (!service) {
      throw new Error(`Unknown master data service: ${serviceName}`);
    }

    const token = await getAccessToken(service, options.fetchImpl);
    const requestUrl = new URL(service.requestPath, `${service.apiUrl}/`).toString();
    const response = await (options.fetchImpl || fetch)(requestUrl, {
      method: service.requestMethod,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
        ...service.apiHeaders,
        ...(options.headers && typeof options.headers === "object" ? options.headers : {}),
      },
      body: JSON.stringify(payload || {}),
    });

    const data = await safeJson(response);
    if (!response.ok) {
      throw new Error(
        data && typeof data.error === "string" && data.error
          ? data.error
          : `Master data API request failed with status ${response.status}`
      );
    }

    return {
      service: service.name,
      data,
      tokenType: token.tokenType,
      requestedAt: new Date().toISOString(),
    };
  }

  async function getAccessToken(service, fetchImpl) {
    const cached = tokenCache.get(service.name);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 10_000) {
      return cached;
    }

    const response = await (fetchImpl || fetch)(service.tokenUrl, {
      method: service.tokenMethod,
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${encodeBasicAuth(service.accessKey, service.secretKey)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...service.tokenHeaders,
      },
      body: defaultTokenRequestBody(service.scope),
    });
    const data = await safeJson(response);
    if (!response.ok) {
      throw new Error(
        data && typeof data.error_description === "string" && data.error_description
          ? data.error_description
          : `OAuth token request failed with status ${response.status}`
      );
    }

    const accessToken = assertString(data.access_token, "access_token");
    const expiresIn = Number.isFinite(Number(data.expires_in)) ? Number(data.expires_in) : 3600;
    const tokenType =
      typeof data.token_type === "string" && data.token_type.trim()
        ? data.token_type.trim()
        : "Bearer";
    const tokenRecord = {
      accessToken,
      tokenType,
      expiresAt: now + expiresIn * 1000,
      fingerprint: crypto.createHash("sha256").update(accessToken).digest("hex").slice(0, 12),
    };
    tokenCache.set(service.name, tokenRecord);
    return tokenRecord;
  }

  return {
    registerService,
    listServices,
    isExist,
    call,
    _unsafe: {
      getAccessToken,
      serviceMap,
      tokenCache,
    },
  };
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

module.exports = {
  createMasterDataService,
};
