import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CreateMediaUploadInput,
  MediaContentType,
  MediaUploadTicket,
} from "@archive/contracts";

import type { AuthenticatedActor } from "../app.js";

export interface R2MediaStorageOptions {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
  expiresInSeconds?: number;
}

const extensionByContentType: Record<MediaContentType, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function objectKey(input: CreateMediaUploadInput, now: Date): string {
  const basename = input.filename
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const prefix = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `images/${prefix}/${randomUUID()}-${basename || "image"}.${extensionByContentType[input.contentType]}`;
}

export function createR2MediaStorage(options: R2MediaStorageOptions) {
  const expiresInSeconds = options.expiresInSeconds ?? 300;
  const publicBaseUrl = options.publicBaseUrl.replace(/\/$/, "");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  return {
    async createUpload(
      input: CreateMediaUploadInput,
      actor: AuthenticatedActor,
    ): Promise<MediaUploadTicket> {
      void actor;
      const key = objectKey(input, new Date());
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          ContentType: input.contentType,
          ContentLength: input.sizeBytes,
        }),
        { expiresIn: expiresInSeconds },
      );
      return {
        method: "PUT",
        key,
        uploadUrl,
        publicUrl: `${publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`,
        expiresInSeconds,
        headers: { "content-type": input.contentType },
      };
    },
  };
}
