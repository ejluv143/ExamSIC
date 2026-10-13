import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { maxAssetBytes } from "@examinus/domain/asset";
import { Context, Effect, Layer, Redacted, Schema } from "effect";
import { AppConfig } from "./AppConfig.ts";

// How long a presigned upload and a signed image URL stay valid.
const uploadSeconds = 10 * 60;
const viewSeconds = 10 * 60;

// The API has no S3 settings. Features turn this into their own error in their handlers.
export class StorageNotConfigured extends Schema.TaggedError<StorageNotConfigured>()("StorageNotConfigured", {}) {}

const unavailable = new StorageNotConfigured();

// Images in an S3-compatible bucket (AWS S3, Cloudflare R2, or Garage locally). Optional: without the S3_*
// settings the API still starts, every call here fails with `StorageNotConfigured`, and images are unavailable.
// S3_PUBLIC_ENDPOINT is the address browsers reach the bucket at when that differs from the API's own
// (a container name, a private network); URLs handed to browsers are signed for it.
export class Storage extends Context.Service<
  Storage,
  {
    readonly configured: boolean;
    // A presigned POST for one object; S3 itself refuses another content type or a file over 5 MB.
    readonly presignUpload: (
      key: string,
      mime: string,
    ) => Effect.Effect<{ url: string; fields: Record<string, string> }, StorageNotConfigured>;
    // Signed GET URLs by key.
    readonly signedUrls: (keys: readonly string[]) => Effect.Effect<Map<string, string>, StorageNotConfigured>;
    // The object's bytes, or null when it doesn't exist (or is larger than the limit).
    readonly read: (key: string) => Effect.Effect<Uint8Array | null, StorageNotConfigured>;
    readonly remove: (keys: readonly string[]) => Effect.Effect<void, StorageNotConfigured>;
  }
>()("examinus/api/Storage") {
  static readonly layer = Layer.effect(
    Storage,
    Effect.gen(function* () {
      const { storage } = yield* AppConfig;
      const { bucket, region, endpoint, publicEndpoint, accessKeyId } = storage;
      const secretAccessKey = Redacted.value(storage.secretAccessKey);
      const configured = bucket !== "" && accessKeyId !== "" && secretAccessKey !== "";

      if (!configured) {
        const fail = Effect.fail(unavailable);
        return Storage.of({
          configured,
          presignUpload: () => fail,
          signedUrls: () => fail,
          read: () => fail,
          remove: () => fail,
        });
      }

      const clientConfig = (url: string): S3ClientConfig => ({
        region: region || "us-east-1",
        credentials: { accessKeyId, secretAccessKey },
        // Garage, MinIO and most S3 clones address buckets by path; AWS accepts it too.
        forcePathStyle: true,
        ...(url === "" ? {} : { endpoint: url }),
      });
      const internal = new S3Client(clientConfig(endpoint));
      // Signatures cover the host, so what browsers receive is signed for the address they will call.
      const external = publicEndpoint === "" || publicEndpoint === endpoint ? internal : new S3Client(clientConfig(publicEndpoint));
      yield* Effect.addFinalizer(() => Effect.sync(() => (internal.destroy(), external.destroy())));

      return Storage.of({
        configured,
        presignUpload: (key, mime) =>
          Effect.promise(() =>
            createPresignedPost(external, {
              Bucket: bucket,
              Key: key,
              Expires: uploadSeconds,
              Fields: { "Content-Type": mime },
              Conditions: [["content-length-range", 1, maxAssetBytes], ["eq", "$Content-Type", mime]],
            }),
          ).pipe(Effect.map(({ url, fields }) => ({ url, fields }))),
        signedUrls: (keys) =>
          Effect.promise(async () => {
            const entries = await Promise.all(
              keys.map(
                async (key) =>
                  [key, await getSignedUrl(external, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: viewSeconds })] as const,
              ),
            );
            return new Map(entries);
          }),
        read: (key) =>
          Effect.promise(async () => {
            try {
              const head = await internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
              if ((head.ContentLength ?? 0) > maxAssetBytes) return null;
              const object = await internal.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
              return (await object.Body?.transformToByteArray()) ?? null;
            } catch (cause) {
              if (cause instanceof Error && ["NotFound", "NoSuchKey"].includes(cause.name)) return null;
              throw cause;
            }
          }),
        remove: (keys) =>
          keys.length === 0
            ? Effect.void
            : Effect.promise(async () => {
                // One request per object: DeleteObjects needs a checksum header some S3 clones don't accept.
                for (let i = 0; i < keys.length; i += 20)
                  await Promise.all(
                    keys.slice(i, i + 20).map((Key) => internal.send(new DeleteObjectCommand({ Bucket: bucket, Key }))),
                  );
              }),
      });
    }),
  );
}
