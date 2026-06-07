"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Datastore = require("@seald-io/nedb");

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  if (actual.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

function normalizeRoles(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function userKey(username) {
  return `user:${String(username || "").trim()}`;
}

function callDatastore(db, methodName, ...args) {
  return new Promise((resolve, reject) => {
    db[methodName](...args, (error, result) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

function loadDatabase(db) {
  return new Promise((resolve, reject) => {
    db.loadDatabase((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function ensureIndex(db, options) {
  return new Promise((resolve, reject) => {
    db.ensureIndex(options, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function createLoginService(config = {}) {
  const dbPath = config.dbPath || path.resolve(process.cwd(), "platform-users.db");
  ensureParentDir(dbPath);

  const db = new Datastore({
    filename: dbPath,
    autoload: false,
  });
  await loadDatabase(db);
  await ensureIndex(db, { fieldName: "user_key", unique: true, sparse: true });
  await ensureIndex(db, { fieldName: "session_hash", unique: true, sparse: true });

  const sessionTtlMs = Number.isFinite(Number(config.sessionTtlMs))
    ? Number(config.sessionTtlMs)
    : 1000 * 60 * 60 * 12;

  async function findUser(username) {
    return callDatastore(db, "findOne", {
      kind: "user",
      user_key: userKey(username),
    });
  }

  async function seedUser(user) {
    const username = String(user.username || "").trim();
    const password = String(user.password || "");
    if (!username || !password) {
      throw new Error("seedUser requires username and password");
    }

    const existing = await findUser(username);
    if (existing) {
      if (user.roles) {
        return ensureUserRoles(username, user.roles);
      }
      return toUserProfile(existing);
    }

    const now = new Date().toISOString();
    const salt = crypto.randomBytes(16).toString("hex");
    await callDatastore(db, "insert", {
      kind: "user",
      user_key: userKey(username),
      username,
      password_hash: hashPassword(password, salt),
      password_salt: salt,
      display_name: String(user.displayName || username),
      roles: normalizeRoles(user.roles),
      is_active: user.isActive === false ? false : true,
      created_at: now,
      updated_at: now,
    });
    return toUserProfile(await findUser(username));
  }

  async function register(user) {
    const username = String(user.username || "").trim();
    const password = String(user.password || "");
    if (!username || !password) {
      throw new Error("register requires username and password");
    }
    if (await findUser(username)) {
      throw new Error("Username already exists");
    }
    return seedUser({
      username,
      password,
      displayName: user.displayName || username,
      roles: user.roles || ["user"],
      isActive: user.isActive,
    });
  }

  async function ensureUserRoles(username, roles) {
    const user = await findUser(username);
    if (!user) {
      throw new Error(`Unknown user: ${username}`);
    }
    const nextRoles = Array.from(new Set([...normalizeRoles(user.roles), ...normalizeRoles(roles)]));
    await callDatastore(
      db,
      "update",
      { _id: user._id },
      {
        $set: {
          roles: nextRoles,
          updated_at: new Date().toISOString(),
        },
      }
    );
    return toUserProfile(await findUser(username));
  }

  async function login(credentials = {}) {
    await cleanupExpiredSessions();
    const username = String(credentials.username || "").trim();
    const password = String(credentials.password || "");
    if (!username || !password) {
      throw new Error("username and password are required");
    }

    const user = await findUser(username);
    if (!user || user.is_active !== true) {
      throw new Error("Invalid username or password");
    }
    if (!verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new Error("Invalid username or password");
    }

    const sessionToken = randomToken();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    await callDatastore(db, "insert", {
      kind: "session",
      session_hash: sha256(sessionToken),
      user_id: user._id,
      issued_at: issuedAt,
      expires_at: expiresAt,
      revoked_at: null,
    });

    return {
      authenticated: true,
      sessionToken,
      user: toUserProfile(user),
      session: {
        issuedAt,
        expiresAt,
      },
    };
  }

  async function authenticateBasicHeader(headerValue) {
    const credentials = parseBasicAuthHeader(headerValue);
    if (!credentials) {
      return null;
    }

    const user = await findUser(credentials.username);
    if (!user || user.is_active !== true) {
      return null;
    }
    if (!verifyPassword(credentials.password, user.password_salt, user.password_hash)) {
      return null;
    }

    return {
      user: toUserProfile(user),
      session: {
        type: "basic",
        issuedAt: new Date().toISOString(),
        expiresAt: null,
      },
    };
  }

  async function authenticate(sessionToken) {
    await cleanupExpiredSessions();
    const token = String(sessionToken || "").trim();
    if (!token) {
      return null;
    }

    const session = await callDatastore(db, "findOne", {
      kind: "session",
      session_hash: sha256(token),
    });
    if (!session || session.revoked_at) {
      return null;
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      await revokeSession(token);
      return null;
    }

    const user = await callDatastore(db, "findOne", {
      kind: "user",
      _id: session.user_id,
    });
    if (!user || user.is_active !== true) {
      return null;
    }

    return {
      user: toUserProfile(user),
      session: {
        issuedAt: session.issued_at,
        expiresAt: session.expires_at,
      },
    };
  }

  async function logout(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) {
      return false;
    }
    return revokeSession(token);
  }

  async function revokeSession(sessionToken) {
    const changed = await callDatastore(
      db,
      "update",
      {
        kind: "session",
        session_hash: sha256(sessionToken),
        revoked_at: null,
      },
      {
        $set: {
          revoked_at: new Date().toISOString(),
        },
      }
    );
    return Number(changed) > 0;
  }

  async function cleanupExpiredSessions() {
    await callDatastore(
      db,
      "remove",
      {
        kind: "session",
        $or: [
          { expires_at: { $lte: new Date().toISOString() } },
          { revoked_at: { $ne: null } },
        ],
      },
      { multi: true }
    );
  }

  async function getUser(username) {
    const user = await findUser(username);
    return user ? toUserProfile(user) : null;
  }

  return {
    seedUser,
    register,
    ensureUserRoles,
    login,
    authenticate,
    authenticateBasicHeader,
    logout,
    cleanupExpiredSessions,
    getUser,
    _unsafe: {
      db,
    },
  };
}

function parseBasicAuthHeader(headerValue) {
  const value = String(headerValue || "").trim();
  if (!value.toLowerCase().startsWith("basic ")) {
    return null;
  }

  let decoded = "";
  try {
    decoded = Buffer.from(value.slice("Basic ".length).trim(), "base64").toString("utf8");
  } catch (_error) {
    return null;
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  return {
    username: decoded.slice(0, separatorIndex),
    password: decoded.slice(separatorIndex + 1),
  };
}

function toUserProfile(user) {
  return {
    id: user._id,
    username: user.username,
    displayName: user.display_name,
    roles: normalizeRoles(user.roles),
    isActive: user.is_active === true,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

module.exports = {
  createLoginService,
};
