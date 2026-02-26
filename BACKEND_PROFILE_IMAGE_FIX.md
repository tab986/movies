# Backend Fix: Profile Image 404

## Problem

Profile image upload succeeds, but profile image display fails with `404` on GET.

Current user payload example:

```json
{
  "profileImage": "r2.gamewiseiq.com/users/userProfile-68e58dbbd0cec6078df36385-1771924376842.jpeg"
}
```

Observed failing request:

- `https://game-wise-backend-production.up.railway.app/r2.gamewiseiq.com/users/userProfile-...jpeg` -> `404`

Direct host request also fails:

- `https://r2.gamewiseiq.com/users/userProfile-...jpeg` -> `404`

This indicates:

1. Frontend previously built an invalid URL by prepending backend host to a domain-like value.
2. Backend/storage path or public serving config is also incorrect for the uploaded key (or returned URL is wrong for the actual object location).

## Required Backend Contract (Recommended)

Return a fully qualified image URL from API responses (not partial host/path), for example:

```json
{
  "profileImage": "https://cdn.gamewiseiq.com/users/userProfile-<userId>-<timestamp>.jpeg"
}
```

If storage is private, return a short-lived signed URL:

```json
{
  "profileImageSignedUrl": "https://<signed-url>"
}
```

## Backend Checks to Fix 404

1. Confirm upload key and read key are identical.
   - Upload key should match returned key exactly (case-sensitive).
2. Confirm correct public domain mapping.
   - Use the exact R2/custom domain serving the bucket.
3. Confirm object visibility/policy.
   - Public bucket or object must allow read if returning raw public URL.
4. Confirm content type and extension are valid.
   - Example: `image/jpeg`.
5. Confirm GET path format.
   - If key is `users/userProfile-...jpeg`, URL must map exactly to that key.

## API Response Guidance

For `PATCH /api/v1/users/profile-image` and `GET /api/v1/users/me/details`:

- Include one canonical field for frontend rendering:
  - `profileImageUrl` (preferred), or
  - `profileImage` as fully qualified URL.
- Avoid returning bare host/path values like `r2.gamewiseiq.com/users/...` without protocol.

## Quick Verification Steps

1. Upload a new profile image.
2. Copy URL returned by API.
3. Open URL directly in browser/private tab.
4. Expect `200` and image bytes.
5. Reload profile page and confirm avatar renders in profile + navbar.

## Status

- Frontend has been updated to handle:
  - absolute URLs
  - domain + path values (`r2.gamewiseiq.com/...`)
  - API-relative paths (`/uploads/...`)
  - plain relative paths (`uploads/...`)
- Backend still needs to ensure returned URL points to a reachable object.
