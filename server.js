const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fetch = globalThis.fetch || require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const DEFAULT_PWD = 'clonal2024';
const ADMIN_PWD   = 'admin2024';

// ── 简单认证中间件：验证 X-Auth-Key ──
function authMiddleware(req, res, next) {
  const key = req.headers['x-authkey'];
  if (key === DEFAULT_PWD || key === ADMIN_PWD) {
    req.isAdmin = (key === ADMIN_PWD);
    return next();
  }
  res.status(401).json({ error: '未授权访问' });
}

const pool = mysql.createPool({
  host: 'localhost',
  user: 'clonalreview',
  password: 'Dong@1213456',
  database: 'clonalreview',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// GET /sync - 获取所有数据
app.get('/sync', authMiddleware, async (req, res) => {
  try {
    const [decisions] = await pool.query('SELECT * FROM decisions');
    const [reviewers] = await pool.query('SELECT * FROM reviewers');
    const [config]     = await pool.query('SELECT * FROM config WHERE id = 1');

    // 将数据库行转换为前端格式
    const decisionsObj = {};
    decisions.forEach(d => {
      if (!decisionsObj[d.paper_id]) decisionsObj[d.paper_id] = {};
      decisionsObj[d.paper_id][d.reviewer_email] = {
        decision:  d.decision,
        note:      d.note      || '',
        aiResult:  d.ai_result || '',
        time:      d.decision_time,
        name:      d.reviewer_name
      };
    });

    const cfg = config[0] || {};
    let adminConfig = null;
    if (cfg.ai_config) {
      const aiCfg = JSON.parse(cfg.ai_config);
      // apiKey 仅服务器内部使用，不下发给客户端
      delete aiCfg.apiKey;
      adminConfig = { aiCfg };
    }
    res.json({
      decisions: decisionsObj,
      reviewers: reviewers,
      config: {
        criteria: {
          inclusion: cfg.inclusion_criteria || '',
          exclusion: cfg.exclusion_criteria || ''
        },
        adminConfig
      }
    });
  } catch (e) {
    console.error('GET /sync error:', e);
    res.status(500).json({ error: e.message });
  }
});

// 从数据库加载 API Key（供 /api/analyze 使用）
async function loadAIKeyFromDB() {
  try {
    const [config] = await pool.query('SELECT ai_config FROM config WHERE id = 1');
    if (config[0] && config[0].ai_config) {
      const aiCfg = JSON.parse(config[0].ai_config);
      return aiCfg.apiKey || null;
    }
  } catch (e) {
    console.error('loadAIKeyFromDB error:', e);
  }
  return null;
}

// POST /sync - 保存数据
app.post('/sync', authMiddleware, async (req, res) => {
  const { decisions, reviewers, criteria, adminConfig } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 保存评审决策
    if (decisions) {
      for (const [pid, revs] of Object.entries(decisions)) {
        for (const [email, dec] of Object.entries(revs)) {
          await conn.query(
            `INSERT INTO decisions
               (paper_id, reviewer_email, reviewer_name, decision, note, ai_result, decision_time)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               decision       = VALUES(decision),
               note           = VALUES(note),
               ai_result      = VALUES(ai_result),
               decision_time  = VALUES(decision_time),
               reviewer_name  = VALUES(reviewer_name)`,
            [pid, email, dec.name || '', dec.decision || 'pending',
             dec.note || '', dec.aiResult || '', dec.time || Date.now()]
          );
        }
      }
    }

    // 保存评审员
    if (reviewers && Array.isArray(reviewers)) {
      for (const r of reviewers) {
        await conn.query(
          `INSERT INTO reviewers (email, name) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          [r.email, r.name || '']
        );
      }
    }

    // ── 关键修复：criteria 和 adminConfig 合并成一条 SQL，避免字段互相覆盖 ──
    const setClauses = [];
    const values     = [];

    if (criteria) {
      setClauses.push('inclusion_criteria = ?', 'exclusion_criteria = ?');
      values.push(criteria.inclusion || '', criteria.exclusion || '');
    }

    // 只有管理员推送的 adminConfig 才存储
    if (adminConfig && adminConfig.aiCfg) {
      setClauses.push('ai_config = ?');
      values.push(JSON.stringify(adminConfig.aiCfg));
    }

    if (setClauses.length > 0) {
      await conn.query(
        `INSERT INTO config (id) VALUES (1)
         ON DUPLICATE KEY UPDATE ${setClauses.join(', ')}`,
        values
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (e) {
    await conn.rollback();
    console.error('POST /sync error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// POST /analyze - AI 分析代理，key 不下发给客户端
app.post('/analyze', authMiddleware, async (req, res) => {
  const { provider, model, baseURL, sys, prompt, paper } = req.body;
  const apiKey = await loadAIKeyFromDB();
  if (!apiKey) return res.status(500).json({ error: 'AI API Key 未在服务器配置' });

  let url = baseURL;
  if (provider === 'deepseek') url = (baseURL || 'https://api.deepseek.com') + '/v1/chat/completions';
  else if (provider === 'openai') url = (baseURL || 'https://api.openai.com') + '/v1/chat/completions';
  else return res.status(400).json({ error: '不支持的 provider' });

  const messages = [];
  if (sys) messages.push({ role: 'system', content: sys });
  messages.push({ role: 'user', content: prompt });

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: model || (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-3.5-turbo'),
        messages,
        temperature: 0.2,
        max_tokens: 400
      })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      return res.status(r.status).json({ error: err?.error?.message || 'API 错误' });
    }
    const data = await r.json();
    res.json({ result: data.choices[0].message.content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ClonalReview API running on port ${PORT}`);
});
