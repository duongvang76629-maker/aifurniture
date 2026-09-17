/* ============================================================================
 * NextAuth（Google）配置
 * JWT 会话策略；登录成功时把用户 upsert 进 users 表（数据库未配置不阻塞登录）。
 * ==========================================================================*/
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { query } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      // 占位值保证模块可构建；真实值在 .env.local 配置
      clientId: process.env.GOOGLE_CLIENT_ID ?? "placeholder",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "placeholder",
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      try {
        await query(
          `INSERT INTO users (email, name, avatar_url)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE
             SET name = EXCLUDED.name,
                 avatar_url = EXCLUDED.avatar_url,
                 updated_at = now()`,
          [user.email, user.name ?? null, user.image ?? null]
        );
      } catch {
        // 数据库未就绪时不阻断登录，仅跳过落库
      }
      return true;
    },
  },
};
