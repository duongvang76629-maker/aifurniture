-- ============================================================================
-- aifurniture.lol 全栈服务数据表（适用于任意 PostgreSQL）
-- 使用：createdb aifurniture 之后执行本文件
--   psql -d aifurniture -f sql/01_init.sql
-- 会话策略为 NextAuth JWT，故只需业务表，不建 NextAuth adapter 系列表。
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 用户：首次 Google 登录时 upsert
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 空间方案生成任务（结果由 Replicate 回调更新，图片落 R2）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  prompt        TEXT NOT NULL,                 -- 用户原始描述（任意语言）
  prompt_en     TEXT,                          -- 翻译/优化后的英文提示词
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued','processing','succeeded','failed')),
  replicate_id  TEXT,                          -- Replicate prediction id
  image_url     TEXT,                          -- R2 上的成品图地址
  r2_key        TEXT,                          -- R2 对象 key
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generations_user      ON generations (user_id);
CREATE INDEX IF NOT EXISTS idx_generations_replicate ON generations (replicate_id);
CREATE INDEX IF NOT EXISTS idx_generations_status    ON generations (status);

-- ----------------------------------------------------------------------------
-- Stripe 客户映射
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id  TEXT NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user ON stripe_customers (user_id);

-- ----------------------------------------------------------------------------
-- Stripe 订阅（webhook 以 stripe_subscription_id 幂等 upsert）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID REFERENCES users(id) ON DELETE CASCADE,
  user_email             TEXT,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id     TEXT,
  stripe_price_id        TEXT,
  status                 TEXT NOT NULL DEFAULT 'incomplete',
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);

-- ----------------------------------------------------------------------------
-- 翻译任务队列（Vercel Cron 每分钟轮询；把方案文本翻译为其他语言）
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS translation_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id  UUID REFERENCES generations(id) ON DELETE CASCADE,
  source_text    TEXT NOT NULL,
  source_lang    TEXT NOT NULL DEFAULT 'auto',
  target_lang    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','done','failed')),
  result         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_translation_pending
  ON translation_jobs (status, created_at)
  WHERE status = 'pending';
