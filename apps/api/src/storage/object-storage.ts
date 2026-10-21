import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ApiConfig } from "../config";

export interface StoredObject {
  body: Buffer;
  contentType: string;
  contentLength: number;
  etag?: string;
}

export interface ObjectStorage {
  readonly provider: "disabled" | "local" | "spaces";
  put(input: { key: string; body: Buffer; contentType: string; sha256Hex: string }): Promise<{ etag?: string }>;
  get(key: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
}

export class ObjectStorageUnavailableError extends Error {
  constructor() { super("Private document storage is not connected."); this.name = "ObjectStorageUnavailableError"; }
}

const storageKeyPattern = /^[a-z0-9][a-z0-9/_.-]{10,500}$/;

function validKey(key: string): string {
  if (!storageKeyPattern.test(key) || key.split("/").includes("..")) throw new Error("invalid object storage key");
  return key;
}

class DisabledObjectStorage implements ObjectStorage {
  readonly provider = "disabled" as const;
  async put(): Promise<never> { throw new ObjectStorageUnavailableError(); }
  async get(): Promise<never> { throw new ObjectStorageUnavailableError(); }
  async delete(): Promise<never> { throw new ObjectStorageUnavailableError(); }
}

export class LocalObjectStorage implements ObjectStorage {
  readonly provider = "local" as const;
  private readonly root: string;

  constructor(root: string) { this.root = path.resolve(root); }

  private filePath(key: string): string {
    const resolved = path.resolve(this.root, validKey(key));
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error("object key escaped storage root");
    return resolved;
  }

  async put(input: { key: string; body: Buffer; contentType: string; sha256Hex: string }) {
    const target = this.filePath(input.key);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, input.body, { flag: "wx", mode: 0o600 });
    return { etag: input.sha256Hex };
  }

  async get(key: string): Promise<StoredObject> {
    const body = await readFile(this.filePath(key));
    return { body, contentLength: body.byteLength, contentType: "application/octet-stream" };
  }

  async delete(key: string): Promise<void> {
    try { await unlink(this.filePath(key)); } catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error; }
  }
}

class SpacesObjectStorage implements ObjectStorage {
  readonly provider = "spaces" as const;
  private readonly client: S3Client;

  constructor(private readonly bucket: string, input: { endpoint: string; region: string; accessKey: string; secretKey: string }) {
    this.client = new S3Client({ endpoint: input.endpoint, region: input.region, forcePathStyle: false, credentials: { accessKeyId: input.accessKey, secretAccessKey: input.secretKey } });
  }

  async put(input: { key: string; body: Buffer; contentType: string; sha256Hex: string }) {
    const result = await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: validKey(input.key), Body: input.body, ContentType: input.contentType, ContentLength: input.body.byteLength, Metadata: { sha256: input.sha256Hex } }));
    return { ...(result.ETag ? { etag: result.ETag } : {}) };
  }

  async get(key: string): Promise<StoredObject> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: validKey(key) }));
    if (!result.Body) throw new Error("object storage returned an empty body");
    const body = Buffer.from(await result.Body.transformToByteArray());
    return { body, contentLength: result.ContentLength ?? body.byteLength, contentType: result.ContentType ?? "application/octet-stream", ...(result.ETag ? { etag: result.ETag } : {}) };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: validKey(key) }));
  }
}

export function createObjectStorage(config: ApiConfig): ObjectStorage {
  if (config.objectStorageProvider === "disabled") return new DisabledObjectStorage();
  if (config.objectStorageProvider === "local") return new LocalObjectStorage(config.objectStorageLocalRoot);
  return new SpacesObjectStorage(config.objectStorageBucket!, { endpoint: config.objectStorageEndpoint!, region: config.objectStorageRegion, accessKey: config.objectStorageAccessKey!, secretKey: config.objectStorageSecretKey! });
}
