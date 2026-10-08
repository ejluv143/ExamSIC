import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { maxAssetBytes, StorageUnavailable } from "@examora/contract";
import { Config, Context, Effect, Layer, Redacted } from "effect";

// How long a presigned upload and a signed image URL stay valid.
const uploadSeconds = 10 * 60;
const viewSeconds = 10 * 60;

const unavailable = new StorageUnavailable({ message: "Image storage isn't set up on this server." });

// Images in an S3-compatible bucket (AWS S3, Cloudflare R2, or Garage locally). Optional: without the S3_*
// settings the API still starts, every call here fails with `StorageUnavailable`, and images are unavailable.
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
    ) => Effect.Effect<{ url: string; fields: Record<string, string> }, StorageUnavailable>;
    // Signed GET URLs by key.
    readonly signedUrls: (keys: readonly string[]) => Effect.Effect<Map<string, string>, StorageUnavailable>;
    // The object's bytes, or null when it doesn't exist (or is larger than the limit).
    readonly read: (key: string) => Effect.Effect<Uint8Array | null, StorageUnavailable>;
    readonly remove: (keys: readonly string[]) => Effect.Effect<void, StorageUnavailable>;
  }
>()("examora/api/Storage") {
  static readonly layer = Layer.effect(
    Storage,
    Effect.gen(function* () {
      const text = (name: string) => Config.String(name).pipe(Config.withDefault(""));
      const bucket = yield* text("S3_BUCKET");
      const region = yield* text("S3_REGION");
      const endpoint = yield* text("S3_ENDPOINT");
      const publicEndpoint = yield* text("S3_PUBLIC_ENDPOINT");
      const accessKeyId = yield* text("S3_ACCESS_KEY_ID");
      const secretAccessKey = Redacted.value(yield* Config.Redacted("S3_SECRET_ACCESS_KEY").pipe(Config.withDefault(Redacted.make(""))));
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
