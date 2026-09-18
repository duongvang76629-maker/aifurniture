import { getConfigStatus } from "@/lib/env";

export const metadata = { title: "服务配置 · aifurniture.lol" };

export default function ConfigPage() {
  const items = getConfigStatus();
  const ready = items.filter((i) => i.configured).length;

  const groups = Array.from(new Set(items.map((i) => i.group))).map((g) => ({
    name: g,
    items: items.filter((i) => i.group === g),
  }));

  return (
    <main className="wrap">
      <div className="head">
        <span className="mark">AI</span>
        <h1>aifurniture.lol · 服务配置</h1>
      </div>
      <p className="subtitle">
        全栈服务骨架：Google 登录 · PostgreSQL · Cloudflare R2 · Stripe 订阅 ·
        Replicate 渲染回调
      </p>
      <p className="progress">
        配置进度：{ready} / {items.length}
      </p>

      {groups.map((g) => (
        <section key={g.name} className="group">
          <h2>{g.name}</h2>
          {g.items.map((item) => (
            <div key={item.key} className="row">
              <span className={`dot ${item.configured ? "ok" : "no"}`} />
              <span>{item.label}</span>
              <span className="spacer" />
              <span className="key">{item.key}</span>
            </div>
          ))}
        </section>
      ))}

      <div className="actions">
        <a className="btn primary" href="/api/auth/signin/google">
          使用 Google 登录
        </a>
        <a className="btn" href="/studio">
          返回工作台
        </a>
      </div>

      <p className="note">
        在 <code>web/.env.local</code> 中填入各服务凭据后重启{" "}
        <code>npm run dev</code>；生产密钥在 Vercel 后台配置。
      </p>
    </main>
  );
}
