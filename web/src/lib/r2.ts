/* ============================================================================
 * Cloudflare R2（S3 兼容）客户端
 * 在 R2 后台创建 Bucket 与 API Token 后，把凭据写入环境变量。
 * 图片 URL 压缩需在 Cloudflare「图像 → 转换」针对访问域名开启。
 * ==========================================================================*/
import {
  S3Client,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function getR2(): S3Client {
  if (client) return client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 凭据未配置（R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY）");
  }
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return client;
}

export async function uploadToR2(
  key: string,
  body: PutObjectCommandInput["Body"],
  contentType = "image/png"
): Promise<void> {
  const Bucket = process.env.R2_BUCKET_NAME || "aifurniture-images";
  await getR2().send(
    new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType })
  );
}

/** 成品图的公开访问地址（经 Cloudflare Images 转换域名） */
export function r2PublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_URL || "";
  return `${base.replace(/\/$/, "")}/${key}`;
}
