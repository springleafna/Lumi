import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ParsedImageCandidate } from '@lumi/parser';
import { createObjectStorage, type ObjectStorage } from '@lumi/storage';
import axios, { AxiosError } from 'axios';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type {
  DocumentMediaKind,
  DocumentMediaReason,
  DocumentMediaStatus,
  Prisma,
} from '../generated/prisma';

type ArchiveArticleMediaInput = {
  userId: string;
  documentId: string;
  articleUrl: string;
  markdown: string;
  coverImage?: string | null;
  images?: ParsedImageCandidate[];
};

type ArchiveArticleMediaResult = {
  markdown: string;
  coverImage?: string | null;
  assets: Prisma.DocumentMediaAssetCreateManyInput[];
};

type MediaCandidate = {
  kind: DocumentMediaKind;
  originalUrl: string;
  normalizedUrl: string;
};

type ObjectStorageSettings = {
  endpoint: string;
  bucket: string;
  publicBaseUrl: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle: boolean;
};

type DownloadedImage = {
  buffer: Buffer;
  contentType?: string;
};

type DetectedImage = {
  contentType: string;
  extension: string;
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_CONTENT_IMAGES = 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const DOWNLOAD_TIMEOUT_MS = 10000;
const IMAGE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

@Injectable()
export class MediaArchiveService {
  private readonly logger = new Logger(MediaArchiveService.name);

  constructor(private readonly configService: ConfigService) {}

  async archiveArticleMedia(
    input: ArchiveArticleMediaInput,
  ): Promise<ArchiveArticleMediaResult> {
    const storageConfig = this.getObjectStorageSettings();
    const storage = storageConfig ? createObjectStorage(storageConfig) : null;
    const candidates = this.buildCandidates(input);
    const assets: Prisma.DocumentMediaAssetCreateManyInput[] = [];
    const replacementMap = new Map<string, string>();
    const uploadedByHash = new Map<string, { objectKey: string; publicUrl: string }>();

    for (const candidate of candidates) {
      if (candidate.normalizedUrl.startsWith('over-limit:')) {
        const normalizedCandidate = {
          ...candidate,
          normalizedUrl: candidate.normalizedUrl.replace(/^over-limit:/, ''),
        };
        assets.push(
          this.createAsset(input, normalizedCandidate, 'skipped', 'over_limit'),
        );
        continue;
      }

      if (!storage) {
        assets.push(
          this.createAsset(input, candidate, 'skipped', 'storage_not_configured'),
        );
        continue;
      }

      const archived = await this.archiveOne({
        input,
        candidate,
        storage,
        uploadedByHash,
      });
      assets.push(archived.asset);
      if (archived.publicUrl) {
        replacementMap.set(candidate.normalizedUrl, archived.publicUrl);
        replacementMap.set(candidate.originalUrl, archived.publicUrl);
      }
    }

    let markdown = input.markdown;
    let coverImage = input.coverImage;
    for (const [from, to] of replacementMap.entries()) {
      if (!from || from === to) continue;
      markdown = markdown.split(from).join(to);
      if (coverImage === from) {
        coverImage = to;
      }
    }

    return {
      markdown,
      coverImage,
      assets,
    };
  }

  async deleteObjectsBestEffort(objectKeys: Array<string | null | undefined>) {
    const storageConfig = this.getObjectStorageSettings();
    if (!storageConfig) return;
    const storage = createObjectStorage(storageConfig);
    const uniqueKeys = Array.from(new Set(objectKeys.filter(Boolean) as string[]));

    for (const key of uniqueKeys) {
      try {
        await storage.delete(key);
      } catch (error) {
        this.logger.warn(`媒体对象删除失败 ${key}: ${getErrorMessage(error)}`);
      }
    }
  }

  private buildCandidates(input: ArchiveArticleMediaInput): MediaCandidate[] {
    const candidates: MediaCandidate[] = [];
    const seenByKind = new Set<string>();
    const contentImages = input.images || [];

    for (const image of contentImages.slice(0, MAX_CONTENT_IMAGES)) {
      const candidate = this.toCandidate(image.kind, image.originalUrl, image.normalizedUrl);
      if (!candidate) continue;
      const dedupeKey = `${candidate.kind}:${candidate.normalizedUrl}`;
      if (seenByKind.has(dedupeKey)) continue;
      seenByKind.add(dedupeKey);
      candidates.push(candidate);
    }

    for (const image of contentImages.slice(MAX_CONTENT_IMAGES)) {
      const candidate = this.toCandidate(image.kind, image.originalUrl, image.normalizedUrl);
      if (!candidate) continue;
      const dedupeKey = `${candidate.kind}:${candidate.normalizedUrl}`;
      if (seenByKind.has(dedupeKey)) continue;
      seenByKind.add(dedupeKey);
      candidates.push({
        ...candidate,
        kind: 'content_image',
        normalizedUrl: `over-limit:${candidate.normalizedUrl}`,
      });
    }

    const coverImage = input.coverImage?.trim();
    if (coverImage) {
      const normalizedCover = normalizePublicHttpUrl(coverImage, input.articleUrl);
      if (normalizedCover) {
        candidates.push({
          kind: 'cover_image',
          originalUrl: coverImage,
          normalizedUrl: normalizedCover,
        });
      }
    }

    return candidates;
  }

  private toCandidate(
    kind: string,
    originalUrl: string,
    normalizedUrl: string,
  ): MediaCandidate | null {
    const normalizedKind: DocumentMediaKind =
      kind === 'cover_image' ? 'cover_image' : 'content_image';
    if (!normalizedUrl) return null;
    return {
      kind: normalizedKind,
      originalUrl: originalUrl || normalizedUrl,
      normalizedUrl,
    };
  }

  private async archiveOne(input: {
    input: ArchiveArticleMediaInput;
    candidate: MediaCandidate;
    storage: ObjectStorage;
    uploadedByHash: Map<string, { objectKey: string; publicUrl: string }>;
  }): Promise<{
    asset: Prisma.DocumentMediaAssetCreateManyInput;
    publicUrl?: string;
  }> {
    const { candidate } = input;

    const validation = await this.validateCandidate(candidate.normalizedUrl);
    if (validation) {
      return {
        asset: this.createAsset(input.input, candidate, 'skipped', validation),
      };
    }

    try {
      const downloaded = await downloadImage(candidate.normalizedUrl, input.input.articleUrl);
      const detected = detectImage(downloaded, candidate.normalizedUrl);
      if (!detected) {
        return {
          asset: this.createAsset(
            input.input,
            candidate,
            'failed',
            'mime_mismatch',
            {
              contentType: downloaded.contentType,
              byteSize: downloaded.buffer.byteLength,
            },
          ),
        };
      }

      const contentHash = createHash('sha256').update(downloaded.buffer).digest('hex');
      let uploaded = input.uploadedByHash.get(contentHash);
      if (!uploaded) {
        const objectKey = `users/${input.input.userId}/documents/${input.input.documentId}/images/${contentHash}.${detected.extension}`;
        try {
          uploaded = await input.storage.upload({
            key: objectKey,
            body: downloaded.buffer,
            contentType: detected.contentType,
            cacheControl: IMAGE_CACHE_CONTROL,
          });
        } catch (error) {
          throw new Error(`upload_failed: ${getErrorMessage(error)}`);
        }
        input.uploadedByHash.set(contentHash, uploaded);
      }

      return {
        asset: this.createAsset(input.input, candidate, 'succeeded', undefined, {
          contentType: detected.contentType,
          byteSize: downloaded.buffer.byteLength,
          contentHash,
          objectKey: uploaded.objectKey,
          publicUrl: uploaded.publicUrl,
        }),
        publicUrl: uploaded.publicUrl,
      };
    } catch (error) {
      const reason = this.toFailureReason(error);
      return {
        asset: this.createAsset(input.input, candidate, 'failed', reason, {
          errorMessage: getErrorMessage(error),
        }),
      };
    }
  }

  private createAsset(
    input: ArchiveArticleMediaInput,
    candidate: MediaCandidate,
    status: DocumentMediaStatus,
    reason?: DocumentMediaReason,
    extra: Partial<Prisma.DocumentMediaAssetCreateManyInput> = {},
  ): Prisma.DocumentMediaAssetCreateManyInput {
    return {
      userId: input.userId,
      documentId: input.documentId,
      kind: candidate.kind,
      status,
      reason,
      originalUrl: candidate.originalUrl,
      normalizedUrl: candidate.normalizedUrl,
      ...extra,
    };
  }

  private async validateCandidate(
    value: string,
  ): Promise<DocumentMediaReason | undefined> {
    if (value.startsWith('data:')) return 'data_url_not_supported';

    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return 'invalid_url';
    }

    if (!['http:', 'https:'].includes(url.protocol)) return 'invalid_url';
    if (url.pathname.toLowerCase().endsWith('.svg')) return 'unsupported_type';

    try {
      await assertPublicHttpUrl(url);
    } catch (error) {
      return getErrorMessage(error) === 'blocked_private_ip'
        ? 'blocked_private_ip'
        : 'invalid_url';
    }

    return undefined;
  }

  private toFailureReason(error: unknown): DocumentMediaReason {
    const message = getErrorMessage(error);
    if (message === 'download_timeout') return 'download_timeout';
    if (message === 'too_large') return 'too_large';
    if (message === 'redirect_blocked') return 'redirect_blocked';
    if (message === 'blocked_private_ip') return 'blocked_private_ip';
    if (message.startsWith('upload_failed')) return 'upload_failed';
    if (message === 'unsupported_type') return 'unsupported_type';
    return 'download_failed';
  }

  private getObjectStorageSettings(): ObjectStorageSettings | null {
    const endpoint = this.configService.get<string>('OBJECT_STORAGE_ENDPOINT')?.trim();
    const bucket = this.configService.get<string>('OBJECT_STORAGE_BUCKET')?.trim();
    const publicBaseUrl = this.configService
      .get<string>('OBJECT_STORAGE_PUBLIC_BASE_URL')
      ?.trim();
    const accessKeyId = this.configService
      .get<string>('OBJECT_STORAGE_ACCESS_KEY_ID')
      ?.trim();
    const secretAccessKey = this.configService
      .get<string>('OBJECT_STORAGE_SECRET_ACCESS_KEY')
      ?.trim();

    if (!endpoint || !bucket || !publicBaseUrl || !accessKeyId || !secretAccessKey) {
      return null;
    }

    return {
      endpoint,
      bucket,
      publicBaseUrl,
      accessKeyId,
      secretAccessKey,
      region:
        this.configService.get<string>('OBJECT_STORAGE_REGION')?.trim() ||
        'us-east-1',
      forcePathStyle:
        this.configService.get<string>('OBJECT_STORAGE_FORCE_PATH_STYLE') !== 'false',
    };
  }
}

async function downloadImage(
  initialUrl: string,
  articleUrl: string,
): Promise<DownloadedImage> {
  let currentUrl = new URL(initialUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHttpUrl(currentUrl);

    try {
      const response = await axios.get<ArrayBuffer>(currentUrl.toString(), {
        responseType: 'arraybuffer',
        timeout: DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
          Referer: articleUrl,
        },
        transformResponse: [(data) => data],
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (!location || redirectCount === MAX_REDIRECTS) {
          throw new Error('redirect_blocked');
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
        throw new Error('too_large');
      }

      const buffer = Buffer.from(response.data);
      if (buffer.byteLength > MAX_IMAGE_BYTES) {
        throw new Error('too_large');
      }

      return {
        buffer,
        contentType: normalizeContentType(response.headers['content-type']),
      };
    } catch (error) {
      if (error instanceof AxiosError && error.code === 'ECONNABORTED') {
        throw new Error('download_timeout');
      }
      throw error;
    }
  }

  throw new Error('redirect_blocked');
}

function detectImage(image: DownloadedImage, url: string): DetectedImage | null {
  const magic = detectByMagicBytes(image.buffer);
  const contentType = image.contentType;

  if (magic) {
    return magic;
  }

  if (contentType && CONTENT_TYPE_TO_EXTENSION[contentType]) {
    return {
      contentType,
      extension: CONTENT_TYPE_TO_EXTENSION[contentType],
    };
  }

  const extension = getSupportedExtensionFromUrl(url);
  if (extension && (!contentType || contentType === 'application/octet-stream')) {
    return {
      contentType: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
      extension,
    };
  }

  return null;
}

function detectByMagicBytes(buffer: Buffer): DetectedImage | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { contentType: 'image/jpeg', extension: 'jpg' };
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { contentType: 'image/png', extension: 'png' };
  }

  const header = buffer.subarray(0, 12).toString('ascii');
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return { contentType: 'image/gif', extension: 'gif' };
  }
  if (header.startsWith('RIFF') && header.endsWith('WEBP')) {
    return { contentType: 'image/webp', extension: 'webp' };
  }

  const avifHeader = buffer.subarray(4, 32).toString('ascii');
  if (avifHeader.includes('ftyp') && /avif|avis/.test(avifHeader)) {
    return { contentType: 'image/avif', extension: 'avif' };
  }

  return null;
}

function normalizeContentType(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.split(';')[0]?.trim().toLowerCase() || undefined;
}

function getSupportedExtensionFromUrl(value: string) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    const extension = pathname.split('.').pop();
    if (!extension) return undefined;
    const normalized = extension === 'jpeg' ? 'jpg' : extension;
    return ['jpg', 'png', 'webp', 'gif', 'avif'].includes(normalized)
      ? normalized
      : undefined;
  } catch {
    return undefined;
  }
}

async function assertPublicHttpUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('invalid_url');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '0.0.0.0'
  ) {
    throw new Error('blocked_private_ip');
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('blocked_private_ip');
    return;
  }

  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((address) => isPrivateIp(address.address))) {
    throw new Error('blocked_private_ip');
  }
}

function isPrivateIp(value: string) {
  if (value.startsWith('::ffff:')) {
    return isPrivateIp(value.replace('::ffff:', ''));
  }

  const version = isIP(value);
  if (version === 4) {
    const parts = value.split('.').map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }

  if (version === 6) {
    const normalized = value.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return true;
}

function normalizePublicHttpUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'unknown';
}
