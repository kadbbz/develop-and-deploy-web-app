import Datastore from "@seald-io/nedb";
import express, { type NextFunction, type Request, type Response } from "express";
import fs from "fs";
import os from "os";
import path from "path";

const { createLoginService } = require("../customize/login-service.js");

type AppUser = {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  isActive: boolean;
};

type AuthSession = {
  user: AppUser;
  session: {
    issuedAt: string;
    expiresAt: string | null;
    type?: string;
  };
};

type AuthRequest = Request & {
  auth?: AuthSession;
};

type RecordDoc = {
  _id: string;
  kind: "record";
  owner_username: string;
  title: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  payload: Record<string, unknown>;
  schema_version: number;
  created_at: string;
  updated_at: string;
};

type BusinessRuleResult = {
  ruleLevel: "high" | "medium" | "normal";
  ruleLabel: string;
  amountBand: string;
  followUpDays: number;
  reviewRequired: boolean;
  suggestedAction: string;
};

const CURRENT_SCHEMA_VERSION = 1;
const app = express();
const token = process.env.APP_TOKEN || "__TOKEN__";
const basePath = process.env.BASE_PATH || `/${token}`;
const apiBase = `${basePath}/api`;
const port = Number(process.env.PORT || "3000");
const appOwner = process.env.APP_OWNER || process.env.USER_NAME || "__OWNER_USERNAME__";
const clientDist = path.resolve(__dirname, "../../client/dist");
const dataDir = path.resolve(__dirname, "../data");

fs.mkdirSync(dataDir, { recursive: true });

function callDb<T>(db: Datastore<any>, methodName: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const method = (db as unknown as Record<string, Function>)[methodName];
    method.call(db, ...args, (error: Error | null, result: T) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    });
  });
}

function loadDb(db: Datastore<any>): Promise<void> {
  return new Promise((resolve, reject) => {
    db.loadDatabase((error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function ensureIndex(db: Datastore<any>, options: any): Promise<void> {
  return new Promise((resolve, reject) => {
    db.ensureIndex(options, (error: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function platformDataRoot() {
  if (process.env.PLATFORM_DATA_ROOT) {
    return path.join(path.resolve(process.env.PLATFORM_DATA_ROOT), ".lite-apps");
  }
  return path.join(os.homedir(), ".lite-apps");
}

function sessionTokenFromRequest(req: Request) {
  const authorization = req.get("authorization") || "";
  if (authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return (req.get("x-openclaw-session") || req.get("x-liteapp-session") || "").trim();
}

function normalizePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function evaluateBusinessRules(payload: Record<string, unknown>): BusinessRuleResult {
  const amount = Number(payload.opportunityAmount || 0);
  const visitType = String(payload.visitType || "first-visit");
  const summary = String(payload.summary || "");
  const reviewRequired =
    amount >= 100000 ||
    /合同|报价|权限|审计|风险|审批/.test(summary);

  if (amount >= 150000 || visitType === "contract") {
    return {
      ruleLevel: "high",
      ruleLabel: "高优先级",
      amountBand: "重点机会",
      followUpDays: 1,
      reviewRequired: true,
      suggestedAction: "1 个工作日内推进，并同步负责人"
    };
  }

  if (amount >= 50000 || visitType === "follow-up" || reviewRequired) {
    return {
      ruleLevel: "medium",
      ruleLabel: "需要跟进",
      amountBand: amount >= 50000 ? "常规机会" : "小额机会",
      followUpDays: 3,
      reviewRequired,
      suggestedAction: "3 个工作日内补齐信息并更新进展"
    };
  }

  return {
    ruleLevel: "normal",
    ruleLabel: "常规跟进",
    amountBand: "小额机会",
    followUpDays: 7,
    reviewRequired: false,
    suggestedAction: "7 个工作日内完成下一步动作"
  };
}

function normalizeRecordPayload(value: unknown) {
  const payload = normalizePayload(value);
  return {
    ...payload,
    ...evaluateBusinessRules(payload)
  };
}

function migratePayload(payload: Record<string, unknown>, _fromVersion: number) {
  return normalizeRecordPayload(payload);
}

function recordDto(record: RecordDoc) {
  return {
    id: record._id,
    ownerUsername: record.owner_username,
    title: record.title,
    status: record.status,
    payload: migratePayload(record.payload || {}, record.schema_version || 1),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function asyncRoute(
  handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as AuthRequest, res, next)).catch(next);
  };
}

async function bootstrap() {
  const recordsDb = new Datastore<RecordDoc>({
    filename: path.join(dataDir, "records.db"),
    autoload: false,
  });

  await loadDb(recordsDb);
  await ensureIndex(recordsDb, { fieldName: "owner_username" });
  await ensureIndex(recordsDb, { fieldName: "updated_at" });

  const loginService = await createLoginService({
    dbPath:
      process.env.OPENCLAW_USERS_DB ||
      path.join(platformDataRoot(), "platform", "users.db"),
  });
  await loginService.seedUser({
    username: appOwner,
    password: process.env.OPENCLAW_OWNER_PASSWORD || `${token.toLowerCase()}-owner`,
    displayName: appOwner,
    roles: ["user"],
  });

  const requireUser = asyncRoute(async (req, res, next) => {
    const authorization = req.get("authorization") || "";
    const session = authorization.toLowerCase().startsWith("basic ")
      ? await loginService.authenticateBasicHeader(authorization)
      : await loginService.authenticate(sessionTokenFromRequest(req));

    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    req.auth = session;
    next();
  });

  async function getUserRecords(user: AppUser) {
    const query = { kind: "record", owner_username: user.username };
    const records = await callDb<RecordDoc[]>(recordsDb, "find", query);
    return records
      .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
      .map(recordDto);
  }

  async function findRecord(id: string) {
    return callDb<RecordDoc | null>(recordsDb, "findOne", {
      kind: "record",
      _id: id,
    });
  }

  app.use(express.json({ limit: "1mb" }));

  app.get(`${apiBase}/health`, (_req, res) => {
    res.json({
      ok: true,
      token,
      basePath,
      stack: {
        backend: "express",
        database: "nedb",
        frontend: "react",
        components: "ant-design-pro",
        charts: "echarts",
      },
    });
  });

  app.post(
    `${apiBase}/auth/register`,
    asyncRoute(async (req, res) => {
      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");
      const displayName = String(req.body?.displayName || username).trim();
      await loginService.register({ username, password, displayName, roles: ["user"] });
      const session = await loginService.login({ username, password });
      res.status(201).json(session);
    })
  );

  app.post(
    `${apiBase}/auth/login`,
    asyncRoute(async (req, res) => {
      const session = await loginService.login({
        username: req.body?.username,
        password: req.body?.password,
      });
      res.json(session);
    })
  );

  app.get(
    `${apiBase}/auth/session`,
    requireUser,
    asyncRoute(async (req, res) => {
      res.json({
        authenticated: true,
        user: req.auth?.user,
        session: req.auth?.session,
      });
    })
  );

  app.post(
    `${apiBase}/auth/logout`,
    asyncRoute(async (req, res) => {
      await loginService.logout(sessionTokenFromRequest(req));
      res.json({ ok: true });
    })
  );

  app.get(
    `${apiBase}/schema`,
    requireUser,
    asyncRoute(async (_req, res) => {
      res.json({
        currentSchemaVersion: CURRENT_SCHEMA_VERSION,
        recordPayload: {
          versionField: "schemaVersion",
          storageField: "payload",
          migration: "Server migrates older payloads at read time.",
        },
        statuses: ["draft", "submitted", "approved", "rejected"],
      });
    })
  );

  app.get(
    `${apiBase}/records`,
    requireUser,
    asyncRoute(async (req, res) => {
      res.json({ items: await getUserRecords(req.auth!.user) });
    })
  );

  app.post(
    `${apiBase}/records`,
    requireUser,
    asyncRoute(async (req, res) => {
      const title = String(req.body?.title || "").trim();
      if (!title) {
        res.status(400).json({ error: "title is required" });
        return;
      }

      const now = new Date().toISOString();
      const record = await callDb<RecordDoc>(recordsDb, "insert", {
        kind: "record",
        owner_username: req.auth!.user.username,
        title,
        status: "draft",
        payload: normalizeRecordPayload(req.body?.payload),
        schema_version: CURRENT_SCHEMA_VERSION,
        created_at: now,
        updated_at: now,
      });
      res.status(201).json({ item: recordDto(record) });
    })
  );

  app.patch(
    `${apiBase}/records/:id`,
    requireUser,
    asyncRoute(async (req, res) => {
      const record = await findRecord(String(req.params.id));
      if (!record) {
        res.status(404).json({ error: "record not found" });
        return;
      }
      if (record.owner_username !== req.auth!.user.username) {
        res.status(403).json({ error: "record access denied" });
        return;
      }

      const nextStatusValue = String(req.body?.status || record.status);
      if (!["draft", "submitted", "approved", "rejected"].includes(nextStatusValue)) {
        res.status(400).json({ error: "invalid status" });
        return;
      }
      const nextStatus = nextStatusValue as RecordDoc["status"];

      const patch = {
        title: String(req.body?.title || record.title).trim(),
        status: nextStatus,
        payload:
          req.body?.payload === undefined
            ? record.payload
            : normalizeRecordPayload(req.body.payload),
        schema_version: CURRENT_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
      };
      await callDb<number>(recordsDb, "update", { _id: record._id }, { $set: patch });
      res.json({ item: recordDto({ ...record, ...patch }) });
    })
  );

  app.delete(
    `${apiBase}/records/:id`,
    requireUser,
    asyncRoute(async (req, res) => {
      const record = await findRecord(String(req.params.id));
      if (!record) {
        res.status(404).json({ error: "record not found" });
        return;
      }
      if (record.owner_username !== req.auth!.user.username) {
        res.status(403).json({ error: "record access denied" });
        return;
      }

      await callDb<number>(recordsDb, "remove", { _id: record._id }, {});
      res.status(204).end();
    })
  );

  app.get(
    `${apiBase}/stats`,
    requireUser,
    asyncRoute(async (req, res) => {
      const records = await getUserRecords(req.auth!.user);
      const byStatus = ["draft", "submitted", "approved", "rejected"].map((status) => ({
        status,
        count: records.filter((record) => record.status === status).length,
      }));
      res.json({
        total: records.length,
        byStatus,
      });
    })
  );

  app.use(`${apiBase}/*`, (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });

  app.use(basePath, express.static(clientDist));

  app.get(`${basePath}/*`, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  });

  app.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Business app listening on port ${port} at ${basePath}/`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
