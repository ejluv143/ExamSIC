---
type: integration
title: Asset storage
description: How question images and students' drawings and photos are stored in an S3-compatible bucket — the browser-side shrink, presigned uploads pinned to type and size, server-side confirmation by file headers, signed read URLs scoped by role and session state, references by id in markdown and answers, and the daily cleanup.
tags: [assets, s3, images, uploads, presigned, storage]
verified:
  - by: openwiki/0.7.1
    at: 2026-10-18T15:19:56.756Z
sources:
  - id: openwiki-source-c4959f892fd67e985b818fa0
    resource: repo://apps/rpc/src/features/assets/Jobs.ts
  - id: openwiki-source-f8991593b4aed4f87b117031
    resource: repo://apps/rpc/src/features/assets/Service.ts
  - id: openwiki-source-2d1c3b0258ee1f228b2c3a57
    resource: repo://apps/rpc/src/features/attempt/Repo.ts
  - id: openwiki-source-1d6f7c94fa239080fad85fcf
    resource: repo://apps/rpc/src/platform/images.ts
  - id: openwiki-source-1f13c26594b5a15586aed363
    resource: repo://apps/rpc/src/platform/Storage.ts
  - id: openwiki-source-05d002cdc5ed76b416d4c8f6
    resource: repo://apps/web/src/features/assets/upload-image.ts
  - id: openwiki-source-5faf1837c880e0736e96554b
    resource: repo://apps/web/src/features/assets/use-asset-urls.ts
  - id: openwiki-source-ceabfb7693efd6d8b4423d7d
    resource: repo://packages/domain/src/asset.ts
generated: { by: "omp", at: "2026-10-18T15:19:56.756Z" }
---

# Asset storage

Images never pass through the API as bytes: the browser uploads straight to the bucket with a presigned POST and reads with signed GET URLs. The API only decides who may upload or see what, records each asset in `assets`, and checks the bytes once after upload.

## Platform (`platform/Storage.ts`)

- Configured from `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`; without them the API still starts and asset operations fail with `StorageNotConfigured`, which the handlers turn into the contract's "unavailable" error. `devenv up` runs Garage with a bucket and CORS already set.
- Signatures cover the host, so when `S3_PUBLIC_ENDPOINT` differs from `S3_ENDPOINT` (browsers reach the bucket at another address than the API does) a second client signs the browser-facing URLs. Upload POSTs and view URLs are short-lived (ten minutes).
- The presigned POST pins the exact `Content-Type` and a `content-length-range` of 1 byte to `maxAssetBytes` (5 MB), so S3 itself refuses other types and sizes.

## Domain (`packages/domain/asset.ts`)

Purposes are `question` (a teacher's image in a prompt, choice or item) and `answer` (a student's drawing or photo); mimes are PNG, JPEG, WebP and GIF. Assets are referenced **by id, not foreign key**: markdown uses `![alt](asset:<id>)` and answer values carry `asset:<id>` references, and `assetIdsIn(text)` finds every id in a blob of text or JSON. That is what lets the cleanup job see which assets are still used.

## Upload flow

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: a semicolon inside a label breaks rendering; rephrase the label. -->
```text
sequenceDiagram
  participant B as Browser
  participant W as Web (server action)
  participant A as API
  participant S as S3
  B->>B: shrink to ≤ 2000 px on a canvas (drops EXIF, applies rotation; GIF → PNG)
  B->>W: requestImageUpload(purpose, mime, size)
  W->>A: asset.createUpload
  A-->>B: presigned POST (type + size pinned), assetId, row = pending
  B->>S: POST file
  B->>W: confirmImageUpload(assetId)
  W->>A: asset.confirm
  A->>S: read bytes
  A->>A: real type and dimensions from headers; mismatch → delete object, Conflict
  A-->>B: ready (size, width, height, sha256)
```

- `asset.createUpload` needs `asset: ["create"]`; teachers may only create `question` uploads, students and guests only `answer` uploads (a guest's organization is their roster entry's). The object key is `<purpose>/<userId>/<assetId>`.
- `asset.confirm` reads the object, derives the real type and dimensions from the file headers (`platform/images.ts`, no image library), deletes an upload that isn't the image it claimed to be, and marks a valid one `ready` with size, dimensions and a SHA-256. Confirming an already-ready asset is idempotent.

## Who may see an image (`Assets.visible`)

`asset.urls` and the paper/game payloads only sign ids the caller may see: their own assets always; teachers the question images of their own quizzes and bank and the answer images of their sessions; students and guests the question images of quizzes whose sessions are on their roster and **running or ended** (never a scheduled or lobby session's paper). Signed URLs expire after ten minutes, so client components refresh them every eight (`use-asset-urls.ts`) and a long exam never loses its pictures.

On submit, a drawing answer keeps only picture references that are `ready` answer assets owned by the submitting student (`keepOwnPictures`), so a crafted answer can't point at someone else's upload.

## Cleanup (`features/assets/Jobs.ts`)

Once a day `Assets.cleanup` deletes assets older than a day that are still `pending` (never confirmed) or no longer referenced by any quiz, bank question or answer. Files are deleted before rows, so a failed delete leaves the row for tomorrow's run.
