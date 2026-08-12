import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "change-this-admin-key";
const ADOPERATOR_LINK = process.env.ADOPERATOR_LINK || "https://example.com/REPLACE_WITH_YOUR_ADOPERATOR_LINK";

const DB_FILE = path.join(__dirname, "data.json");
const defaultDB = {
  settings: {
    pointsPerAd: 1,
    pointsPerTaka: 3.2,
    adSeconds: 7,
    withdrawEnabled: false,
    minimumWithdrawTaka: null
  },
  ads: [
    { id: "ad1", title: "Ad 1", url: "https://wwpb.giriuvan.com/redirect-zone/b390f67e", active: true },
    { id: "ad2", title: "Ad 2", url: "https://wwpb.giriuvan.com/redirect-zone/9bda9b70", active: true },
    { id: "ad3", title: "Ad 3", url: "https://wwpb.giriuvan.com/redirect-zone/c837d897", active: true },
    { id: "ad4", title: "Ad 4", url: "https://wwpb.giriuvan.com/redirect-zone/55a30fbe", active: true },
    { id: "ad5", title: "Ad 5", url: "https://wwpb.giriuvan.com/redirect-zone/135ac394", active: true }
  ],
  users: {},
  withdrawals: []
};

function loadDB() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDB, null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
let db = loadDB();

function validateTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) return null;

  const user = params.get("user");
  return user ? JSON.parse(user) : null;
}

function getUser(req) {
  const telegramUser = validateTelegramInitData(req.headers["x-telegram-init-data"] || "");
  if (telegramUser) return telegramUser;

  // Demo mode for local UI testing only. Disable in production by requiring valid initData.
  const id = String(req.headers["x-demo-user-id"] || "demo");
  return { id, first_name: "Demo", username: "demo_user" };
}

function ensureUser(tgUser) {
  const id = String(tgUser.id);
  if (!db.users[id]) {
    db.users[id] = {
      id,
      firstName: tgUser.first_name || "",
      username: tgUser.username || "",
      points: 0,
      completedAds: 0,
      lastAdId: null,
      seenAds: {},
      createdAt: new Date().toISOString()
    };
    saveDB(db);
  }
  return db.users[id];
}

app.get("/api/config", (req, res) => {
  res.json({
    pointsPerAd: db.settings.pointsPerAd,
    pointsPerTaka: db.settings.pointsPerTaka,
    adSeconds: db.settings.adSeconds,
    withdrawEnabled: db.settings.withdrawEnabled,
    minimumWithdrawTaka: db.settings.minimumWithdrawTaka
  });
});

app.get("/api/me", (req, res) => {
  const tgUser = getUser(req);
  const user = ensureUser(tgUser);
  res.json({
    id: user.id,
    firstName: user.firstName,
    username: user.username,
    points: user.points,
    taka: Math.floor((user.points / db.settings.pointsPerTaka) * 100) / 100,
    completedAds: user.completedAds,
    withdrawEnabled: db.settings.withdrawEnabled,
    minimumWithdrawTaka: db.settings.minimumWithdrawTaka
  });
});

app.get("/api/ads/next", (req, res) => {
  const tgUser = getUser(req);
  const user = ensureUser(tgUser);
  const active = db.ads.filter(a => a.active);

  // Never return the same ad consecutively.
  const candidates = active.filter(a => a.id !== user.lastAdId);
  const pool = candidates.length ? candidates : active;

  if (!pool.length) return res.status(404).json({ error: "No ads available" });

  // Prefer ads not seen in the current cycle.
  const unseen = pool.filter(a => !user.seenAds[a.id]);
  const ad = (unseen.length ? unseen : pool)[Math.floor(Math.random() * (unseen.length ? unseen.length : pool.length))];

  res.json({ id: ad.id, title: ad.title, url: ad.url, seconds: db.settings.adSeconds });
});

app.post("/api/ads/complete", (req, res) => {
  const tgUser = getUser(req);
  const user = ensureUser(tgUser);
  const { adId, startedAt } = req.body || {};
  const ad = db.ads.find(a => a.id === adId && a.active);
  if (!ad) return res.status(400).json({ error: "Invalid ad" });

  // Server-side minimum elapsed time. This prevents instant completion.
  const elapsed = Date.now() - Number(startedAt || 0);
  if (!Number.isFinite(elapsed) || elapsed < db.settings.adSeconds * 1000) {
    return res.status(400).json({ error: `Wait at least ${db.settings.adSeconds} seconds.` });
  }

  // Same-ad consecutive completion is blocked.
  if (user.lastAdId === ad.id) {
    return res.status(400).json({ error: "Watch another ad before this ad again." });
  }

  user.points += db.settings.pointsPerAd;
  user.completedAds += 1;
  user.lastAdId = ad.id;
  user.seenAds[ad.id] = true;

  // Reset the seen-ad cycle after every active ad has been completed.
  const activeIds = new Set(db.ads.filter(a => a.active).map(a => a.id));
  const seenIds = Object.keys(user.seenAds).filter(id => activeIds.has(id));
  if (seenIds.length >= activeIds.size) user.seenAds = {};

  saveDB(db);

  res.json({
    ok: true,
    points: user.points,
    taka: Math.floor((user.points / db.settings.pointsPerTaka) * 100) / 100
  });
});

app.post("/api/withdraw", (req, res) => {
  const tgUser = getUser(req);
  const user = ensureUser(tgUser);

  if (!db.settings.withdrawEnabled) {
    return res.status(403).json({ error: "Withdraw is currently OFF." });
  }

  const { bkashNumber, taka } = req.body || {};
  const amount = Number(taka);
  const min = db.settings.minimumWithdrawTaka;

  if (!bkashNumber || !/^01[3-9]\d{8}$/.test(String(bkashNumber))) {
    return res.status(400).json({ error: "Enter a valid bKash number." });
  }
  if (!Number.isFinite(amount) || amount <= 0 || (min !== null && amount < min)) {
    return res.status(400).json({ error: "Invalid withdrawal amount." });
  }

  const requiredPoints = amount * db.settings.pointsPerTaka;
  if (user.points < requiredPoints) return res.status(400).json({ error: "Not enough points." });

  user.points -= requiredPoints;
  const item = {
    id: crypto.randomUUID(),
    userId: user.id,
    bkashNumber: String(bkashNumber),
    taka: amount,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  db.withdrawals.push(item);
  saveDB(db);
  res.json({ ok: true, withdrawal: item });
});

function admin(req, res, next) {
  if ((req.headers["x-admin-key"] || "") !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/admin/overview", admin, (req, res) => {
  const users = Object.values(db.users);
  res.json({
    settings: db.settings,
    users: users.length,
    points: users.reduce((s, u) => s + u.points, 0),
    withdrawals: db.withdrawals
  });
});

app.post("/api/admin/settings", admin, (req, res) => {
  const s = req.body || {};
  if (s.pointsPerAd !== undefined) db.settings.pointsPerAd = Number(s.pointsPerAd);
  if (s.pointsPerTaka !== undefined) db.settings.pointsPerTaka = Number(s.pointsPerTaka);
  if (s.adSeconds !== undefined) db.settings.adSeconds = Math.max(1, Number(s.adSeconds));
  if (s.withdrawEnabled !== undefined) db.settings.withdrawEnabled = Boolean(s.withdrawEnabled);
  if (s.minimumWithdrawTaka !== undefined) db.settings.minimumWithdrawTaka = s.minimumWithdrawTaka === null ? null : Number(s.minimumWithdrawTaka);
  saveDB(db);
  res.json(db.settings);
});

app.post("/api/admin/ads", admin, (req, res) => {
  const { id, title, url, active = true } = req.body || {};
  if (!id || !title || !url) return res.status(400).json({ error: "id, title and url are required" });
  const existing = db.ads.find(a => a.id === id);
  if (existing) Object.assign(existing, { title, url, active: Boolean(active) });
  else db.ads.push({ id, title, url, active: Boolean(active) });
  saveDB(db);
  res.json(db.ads);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Mini App running on port ${PORT}`));
