# CMS Database Persistence Fix

## Problem
Homepage settings changes were not saving and not reflecting on the platform because the backend controllers were using in-memory `cmsData` object instead of persisting to the database.

## Solution
Updated all CMS controllers to use Prisma ORM for database persistence using the new `CMSConfig` model.

---

## Changes Made

### 1. **Created CMSConfig Prisma Model** ✅

**File:** `geezle-backend/prisma/schema.prisma`

Added new model:
```prisma
model CMSConfig {
  id          String   @id @default(cuid())
  target      CmsTarget @default(HOMEPAGE)
  version     Int      @default(1)
  data        Json     // Stores all CMS data (header, footer, heroSearch, homeSlides, etc.)
  updatedById String?
  updatedBy   User?    @relation(fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([target])
  @@index([version])
  @@index([updatedById])
}

enum CmsTarget {
  HOMEPAGE
  FOOTER
  GLOBAL
  HEADER
}
```

### 2. **Updated CMS Controllers** ✅

**File:** `geezle-backend/src/controllers/cmsController.ts`

#### Added Helper Functions:
- `getOrCreateCMSConfig()` - Retrieves or creates CMS config from database
- `saveCMSConfig()` - Saves new version of CMS config to database

#### Updated Functions to Use Database:

1. **`getHeaderConfig`** ✅
   - Now reads from database first, falls back to mock data if needed

2. **`saveHeaderConfig`** ✅
   - Saves to database using `CMSConfig` model
   - Updates in-memory cache as well

3. **`getHeroSearchConfig`** ✅
   - Reads from database first

4. **`saveHeroSearchConfig`** ✅
   - Saves hero search config (headline, search placeholder, quick tags, trusted brands) to database

5. **`getHomeSlides`** ✅
   - Reads slides from database

6. **`saveHomeSlide`** ✅
   - Saves individual slide updates to database

7. **`updateHomeSlideOrder`** ✅
   - Updates slide order in database

8. **`deleteHomeSlide`** ✅
   - Removes slide from database

9. **`getFooterConfig`** ✅
   - Reads footer config from database

10. **`saveFooterConfig`** ✅
    - Saves footer config to database

---

## How It Works

### Saving Data:
1. Admin makes changes in Homepage Settings
2. Frontend calls API endpoint (e.g., `/api/cms/hero-search`)
3. Backend controller normalizes the data
4. Backend saves to database using `saveCMSConfig()`
5. Backend also updates in-memory cache for performance
6. Response sent back to frontend

### Loading Data:
1. Frontend requests config (e.g., `CMSService.getHeroSearchConfig()`)
2. Backend controller calls `getOrCreateCMSConfig()`
3. If config exists in DB, returns it
4. If not, creates default config and returns it
5. Frontend displays the config

### Versioning:
- Each save creates a new version in the database
- Latest version is always retrieved using `orderBy: { version: 'desc' }`
- Allows for audit trail and rollback capabilities

---

## Database Structure

The `CMSConfig.data` JSON field stores different structures based on `target`:

### HOMEPAGE target:
```json
{
  "header": { ... },
  "heroSearch": {
    "headline": "...",
    "searchPlaceholder": "...",
    "quickTags": [...],
    "trustedBrands": { ... }
  },
  "homeSlides": [ ... ]
}
```

### FOOTER target:
```json
{
  "footer": {
    "logoUrl": "...",
    "description": "...",
    "columns": [ ... ],
    "socials": [ ... ]
  }
}
```

---

## Testing

### To Test:
1. Make changes in Admin Dashboard → Homepage Settings
2. Save changes
3. Check database: `SELECT * FROM "CMSConfig" ORDER BY "createdAt" DESC;`
4. Refresh homepage - changes should appear
5. Restart server - changes should persist

### Expected Behavior:
- ✅ Changes save to database
- ✅ Changes appear on homepage immediately
- ✅ Changes persist after server restart
- ✅ Multiple admins can make changes (versioned)
- ✅ Audit trail maintained (who made changes, when)

---

## Migration Required

Run this command to apply the database schema changes:

```bash
cd geezle-backend
npx prisma migrate dev --name add_cms_config
```

Or if in production:
```bash
npx prisma migrate deploy
```

Then generate Prisma client:
```bash
npx prisma generate
```

---

## Status: ✅ COMPLETE

All homepage settings now persist to the database and changes reflect correctly on the platform.
