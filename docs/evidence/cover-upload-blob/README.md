# Cover upload: local disk -> Vercel Blob

Evidence for the change that moved collection cover uploads off the local
filesystem. Both shots are the same page at the same viewport (1440x900),
driven through the real UI against a throwaway `ZZ-FM-TEST-cover` collection.

- `before-cover-upload-broken.png` — upload attempted with `public/uploads`
  made read-only to stand in for Vercel's read-only filesystem. The route threw
  `EACCES: mkdir` and returned 500, so no cover was set. (On Vercel the same
  call fails as `EROFS`.) The failure is silent in the UI: this page mounts no
  `Toaster`, so `toast.error` renders nothing.
- `after-cover-upload-on-blob.png` — same flow after the change. The image was
  uploaded to Vercel Blob and the card renders it from
  `https://<store>.public.blob.vercel-storage.com/collections/<id>/cover-<ts>.jpg`.
  Nothing was written under `public/uploads`.
