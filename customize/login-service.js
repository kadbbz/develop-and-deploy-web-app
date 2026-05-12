"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function randomToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function defaultHashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function defaultVerifyPassword(password, salt, expectedHash) {
  const actual = defaultHashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
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

function createLoginService(config = {}) {
  const dbPath = config.dbPath || path.resolve(process.cwd(), "login-service.db");
  ensureParentDir(dbPath);
  const db = new Database(dbPath);
  const sessionTtlMs = Number.isFinite(Number(config.sessionTtlMs))
    ? Number(config.sessionTtlMs)
    : 1000 * 60 * 60 * 12;
  const hashPassword = config.hashPassword || defaultHashPassword;
  const verifyPassword = config.verifyPassword || defaultVerifyPassword;

  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_token TEXT NOT NULL UNIQUE,
      session_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (id)
    );
  `);

  const insertUserStatement = db.prepare(`
    INSERT INTO users (username, password_hash, password_salt, display_name, roles, is_active, created_at, updated_at)
    VALUES (@username, @password_hash, @password_salt, @display_name, @roles, @is_active, @created_at, @updated_at)
  `);
  const selectUserByUsername = db.prepare(`
    SELECT id, username, password_hash, password_salt, display_name, roles, is_active, created_at, updated_at
    FROM users
    WHERE username = ?
  `);
  const selectSessionStatement = db.prepare(`
    SELECT
      sessions.id,
      sessions.session_token,
      sessions.issued_at,
      sessions.expires_at,
      sessions.revoked_at,
      users.id AS user_id,
      users.username,
      users.display_name,
      users.roles,
      users.is_active
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.session_hash = ?
  `);
  const revokeSessionStatement = db.prepare(`
    UPDATE sessions
    SET revoked_at = @revoked_at
    WHERE session_hash = @session_hash AND revoked_at IS NULL
  `);
  const insertSessionStatement = db.prepare(`
    INSERT INTO sessions (session_token, session_hash, user_id, issued_at, expires_at)
    VALUES (@session_token, @session_hash, @user_id, @issued_at, @expires_at)
  `);
  const cleanupSessionsStatement = db.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= @now OR revoked_at IS NOT NULL
  `);

  function seedUser(user) {
    const username = String(user.username || "").trim();
    const password = String(user.password || "");
    if (!username || !password) {
      throw new Error("seedUser requires username and password");
    }
    if (selectUserByUsername.get(username)) {
      return getUserProfile(selectUserByUsername.get(username));
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const now = new Date().toISOString();
    insertUserStatement.run({
      username,
      password_hash: hashPassword(password, salt),
      password_salt: salt,
      display_name: String(user.displayName || username),
      roles: JSON.stringify(normalizeRoles(user.roles)),
      is_active: user.isActive === false ? 0 : 1,
      created_at: now,
      updated_at: now,
    });
    return getUserProfile(selectUserByUsername.get(username));
  }

  function login(credentials = {}) {
    cleanupExpiredSessions();
    const username = String(credentials.username || "").trim();
    const password = String(credentials.password || "");
    if (!username || !password) {
      throw new Error("username and password are required");
    }

    const user = selectUserByUsername.get(username);
    if (!user || user.is_active !== 1) {
      throw new Error("Invalid username or password");
    }
    if (!verifyPassword(password, user.password_salt, user.password_hash)) {
      throw new Error("Invalid username or password");
    }

    const sessionToken = randomToken();
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    insertSessionStatement.run({
      session_token: sessionToken,
      session_hash: sha256(sessionToken),
      user_id: user.id,
      issued_at: issuedAt,
      expires_at: expiresAt,
    });

    return {
      authenticated: true,
      sessionToken,
      user: getUserProfile(user),
      session: {
        issuedAt,
        expiresAt,
      },
    };
  }

  function authenticate(sessionToken) {
    cleanupExpiredSessions();
    const token = String(sessionToken || "").trim();
    if (!token) {
      return null;
    }

    const session = selectSessionStatement.get(sha256(token));
    if (!session) {
      return null;
    }
    if (session.revoked_at) {
      return null;
    }
    if (new Date(session.expires_at).getTime() <= Date.now()) {
      revokeSessionStatement.run({
        revoked_at: new Date().toISOString(),
        session_hash: sha256(token),
      });
      return null;
    }
    if (session.is_active !== 1) {
      return null;
    }

    return {
      user: {
        id: session.user_id,
        username: session.username,
        displayName: session.display_name,
        roles: parseRoles(session.roles),
      },
      session: {
        issuedAt: session.issued_at,
        expiresAt: session.expires_at,
      },
    };
  }

  function logout(sessionToken) {
    const token = String(sessionToken || "").trim();
    if (!token) {
      return false;
    }
    const result = revokeSessionStatement.run({
      revoked_at: new Date().toISOString(),
      session_hash: sha256(token),
    });
    return result.changes > 0;
  }

  function cleanupExpiredSessions() {
    cleanupSessionsStatement.run({ now: new Date().toISOString() });
  }

  return {
    seedUser,
    login,
    authenticate,
    logout,
    cleanupExpiredSessions,
    _unsafe: {
      db,
    },
  };
}

function parseRoles(value) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return normalizeRoles(parsed);
  } catch (_error) {
    return [];
  }
}

function getUserProfile(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    roles: parseRoles(user.roles),
    isActive: user.is_active === 1,
  };
}

module.exports = {
  createLoginService,
};
