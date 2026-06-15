> **Quick overview:** See [PROJECT.md](./PROJECT.md) for stack, API summary, and setup.
# GameWise Backend v3

A Node.js/Express backend for an Iraqi e-shop selling digital game keys, gift cards, and subscriptions. The system syncs products from the **Kinguin ESA API**, handles payments via **Wayl**, delivers CD keys automatically, and provides an admin dashboard for management.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Core Files](#core-files)
   - [server.js](#serverjs)
   - [app.js](#appjs)
3. [Models (Database Schemas)](#models)
   - [userModel.js](#usermodeljs)
   - [KinguinProduct.js](#kinguinproductjs)
   - [Orders.js](#ordersjs)
   - [Coupon.js](#couponjs)
   - [adsModel.js](#adsmodeljs)
   - [homeModel.js](#homemodeljs)
   - [storeModel.js](#storemodeljs)
   - [tagsModel.js](#tagsmodeljs)
   - [categoriesModel.js](#categoriesmodeljs)
   - [productsModel.js](#productsmodeljs)
   - [reviewsModel.js](#reviewsmodeljs)
   - [SyncState.js](#syncstatejs)
   - [PhysicalProduct.js & PhysicalOrder.js](#physicalproductjs--physicalorderjs)
   - [Article.js (post-models)](#articlejs-post-models)
4. [Controllers](#controllers)
   - [authControllers.js](#authcontrollersjs)
   - [orderController.js](#ordercontrollerjs)
   - [productControllers.js](#productcontrollersjs)
   - [syncController.js](#synccontrollerjs)
   - [statsController.js](#statscontrollerjs)
   - [homeController.js](#homecontrollerjs)
   - [storeController.js](#storecontrollerjs)
   - [adsController.js](#adscontrollerjs)
   - [tagsController.js](#tagscontrollerjs)
   - [userControllers.js](#usercontrollersjs)
   - [userDashboardController.js](#userdashboardcontrollerjs)
   - [userProfileControllers.js](#userprofilecontrollersjs)
   - [errorControllers.js](#errorcontrollersjs)
   - [articleController.js](#articlecontrollerjs)
5. [Routes (API Endpoints)](#routes)
   - [userRoutes.js](#userroutesjs)
   - [orderRoutes.js](#orderroutesjs)
   - [productsRoutes.js](#productsroutesjs)
   - [articlesRoutes.js](#articlesroutesjs)
   - [dashboardRoutes.js](#dashboardroutesjs)
   - [syncRoutes.js](#syncroutesjs)
   - [kinguinCacheRoutes.js](#kinguincacheroutesjs)
   - [coupon.js (routes)](#couponjs-routes)
   - [sellerRoutes.js](#sellerroutesjs)
   - [webhooks.js](#webhooksjs)
6. [Workers (Background Jobs)](#workers)
   - [importAll.js](#importalljs)
   - [deltaSync.js](#deltasyncjs)
   - [reconcile.js](#reconcilejs)
   - [scheduler.js](#schedulerjs)
7. [Utilities](#utilities)
   - [APIFeatures.js](#apifeaturesjs)
   - [appError.js](#apperrorjs)
   - [catchAsyncErrors.js](#catchasyncerrorjs)
   - [currency.js](#currencyjs)
   - [handlerFactory.js](#handlerfactoryjs)
   - [imageUploadMiddleware.js](#imageuploadmiddlewarejs)
   - [itadClient.js](#itadclientjs)
   - [platforms.js](#platformsjs)
   - [productSeo.js](#productseojs)
   - [s3Utils.js & deleteR2File.js](#s3utilsjs--deleter2filejs)
   - [deletefiles.js](#deletefilesjs)
   - [parseJsonBodyMiddleware.js](#parsejsonbodymiddlewarejs)
   - [validationMiddleware.js](#validationmiddlewarejs)
   - [coupon.js (utils)](#couponjs-utils)
8. [Library](#library)
   - [kinguinClient.js](#kinguinclientjs)
9. [Configuration](#configuration)
   - [render.yaml](#renderyaml)
   - [Environment Variables](#environment-variables)
10. [Order Flow (How Purchases Work)](#order-flow)
11. [Sync Flow (How Products Are Imported)](#sync-flow)

---

## Project Structure

```
game-wise-backend-v3/
â”œâ”€â”€ server.js                  # Entry point: starts server, connects DB
â”œâ”€â”€ app.js                     # Express app config, middleware, route mounting
â”œâ”€â”€ config.env                 # Environment variables (not in repo)
â”œâ”€â”€ render.yaml                # Render.com deployment config (cron jobs)
â”œâ”€â”€ package.json               # Dependencies
â”‚
â”œâ”€â”€ controllers/               # Business logic for each feature
â”‚   â”œâ”€â”€ authControllers.js     # Signup, login, JWT, OTP, password reset
â”‚   â”œâ”€â”€ orderController.js     # Checkout, payment callback, key delivery
â”‚   â”œâ”€â”€ productControllers.js  # Product listing, ganraGames compact, gift-cards, ITAD popular
â”‚   â”œâ”€â”€ syncController.js      # Triggers full import
â”‚   â”œâ”€â”€ statsController.js     # Dashboard analytics and stats
â”‚   â”œâ”€â”€ homeController.js      # Homepage content management
â”‚   â”œâ”€â”€ storeController.js     # Store/merchant CRUD
â”‚   â”œâ”€â”€ adsController.js       # Advertisement CRUD
â”‚   â”œâ”€â”€ articleController.js   # CMS articles (public + admin)
â”‚   â”œâ”€â”€ tagsController.js      # Tag management
â”‚   â”œâ”€â”€ userControllers.js     # Admin user management
â”‚   â”œâ”€â”€ userDashboardController.js  # User profile (admin view)
â”‚   â”œâ”€â”€ userProfileControllers.js   # User profile (self-service)
â”‚   â””â”€â”€ errorControllers.js    # Global error handler
â”‚
â”œâ”€â”€ post-models/               # Sequelize models (PostgreSQL)
â”‚   â”œâ”€â”€ Article.js             # CMS articles (blog/content)
â”‚   â”œâ”€â”€ KinguinProduct.js      # Cached Kinguin catalog
â”‚   â””â”€â”€ ...                    # Other Sequelize models
â”‚
â”œâ”€â”€ models/                    # Mongoose schemas
â”‚   â”œâ”€â”€ userModel.js           # User accounts (phone auth, roles)
â”‚   â”œâ”€â”€ KinguinProduct.js      # Cached Kinguin products
â”‚   â”œâ”€â”€ Orders.js              # Orders with cart, keys, payment status
â”‚   â”œâ”€â”€ Coupon.js              # Discount coupons
â”‚   â”œâ”€â”€ adsModel.js            # Advertisements/banners
â”‚   â”œâ”€â”€ homeModel.js           # Homepage content
â”‚   â”œâ”€â”€ storeModel.js          # Stores/merchants
â”‚   â”œâ”€â”€ tagsModel.js           # Product tags
â”‚   â”œâ”€â”€ categoriesModel.js     # Product categories
â”‚   â”œâ”€â”€ productsModel.js       # General products (non-Kinguin)
â”‚   â”œâ”€â”€ reviewsModel.js        # Product reviews
â”‚   â””â”€â”€ SyncState.js           # Sync timestamps and profiles
â”‚
â”œâ”€â”€ routes/                    # API endpoint definitions
â”‚   â”œâ”€â”€ userRoutes.js          # /api/v1/users
â”‚   â”œâ”€â”€ orderRoutes.js         # /api/v1/orders
â”‚   â”œâ”€â”€ productsRoutes.js      # /api/v1/products
â”‚   â”œâ”€â”€ articlesRoutes.js      # /api/v1/articles (public CMS reads)
â”‚   â”œâ”€â”€ dashboardRoutes.js     # /api/v1/dashboard
â”‚   â”œâ”€â”€ syncRoutes.js          # /api/v1/sync
â”‚   â”œâ”€â”€ kinguinCacheRoutes.js  # /api/v1/catalog
â”‚   â”œâ”€â”€ coupon.js              # /api/v1/coupon (Postgres coupons)
â”‚   â”œâ”€â”€ sellerRoutes.js        # /api/v1/seller (optional / legacy)
â”‚   â””â”€â”€ webhooks.js            # /webhooks/kinguin/*
â”‚
â”œâ”€â”€ worker/                    # Background sync workers
â”‚   â”œâ”€â”€ importAll.js           # Full catalog import from Kinguin
â”‚   â”œâ”€â”€ deltaSync.js           # Incremental sync (only changed products)
â”‚   â”œâ”€â”€ reconcile.js           # Hide removed products
â”‚   â””â”€â”€ scheduler.js           # Cron scheduler for deltaSync
â”‚
â”œâ”€â”€ utils/                     # Helper utilities
â”‚   â”œâ”€â”€ APIFeatures.js         # Query filtering, sorting, pagination
â”‚   â”œâ”€â”€ appError.js            # Custom error class
â”‚   â”œâ”€â”€ catchAsyncErrors.js    # Async error wrapper
â”‚   â”œâ”€â”€ currency.js            # IQD currency conversion
â”‚   â”œâ”€â”€ handlerFactory.js      # Generic CRUD handlers
â”‚   â”œâ”€â”€ imageUploadMiddleware.js # Image upload to R2
â”‚   â”œâ”€â”€ itadClient.js          # IsThereAnyDeal API client
â”‚   â”œâ”€â”€ platforms.js           # Platform normalization
â”‚   â”œâ”€â”€ productSeo.js          # SEO meta + sitemap hints for public product JSON
â”‚   â”œâ”€â”€ s3Utils.js             # R2/S3 file deletion
â”‚   â”œâ”€â”€ deleteR2File.js        # R2 file deletion (duplicate)
â”‚   â”œâ”€â”€ deletefiles.js         # Local file deletion
â”‚   â”œâ”€â”€ parseJsonBodyMiddleware.js # JSON parsing from form-data
â”‚   â”œâ”€â”€ validationMiddleware.js    # Category/tag validation
â”‚   â””â”€â”€ coupon.js                  # Postgres coupons: apply, create, usage map merge
â”‚
â”œâ”€â”€ lib/                       # External API clients
â”‚   â””â”€â”€ kinguinClient.js       # Axios client for Kinguin API
â”‚
â””â”€â”€ public/                    # Static files
    â””â”€â”€ images/                # Uploaded images
```

---

## Core Files

### server.js

The entry point of the application. This file starts everything.

```
Line 1-5:   Catches uncaught exceptions (crashes) and logs them before exiting.
            This prevents silent failures.

Line 7-8:   Loads environment variables from config.env using dotenv.
            All secrets (API keys, DB connection strings) come from here.

Line 10:    Imports the Express app from app.js (all middleware and routes).

Line 11:    Imports Mongoose for MongoDB connection.

Line 13:    Reads the MongoDB connection string from environment variables.

Line 15-17: Connects to MongoDB. Once connected, logs "DB connected".

Line 19-22: Starts the HTTP server on the configured port (default 3000).

Line 24-27: Disables server timeouts so long-running operations (like full import)
            don't get killed mid-way:
            - requestTimeout = 0: No limit on how long a request can take
            - headersTimeout = 0: No limit on header reception time
            - keepAliveTimeout = 0: Keep connections alive indefinitely

Line 34-41: Catches unhandled promise rejections (e.g., DB connection failures).
            Logs the error, then gracefully shuts down the server and exits.
```

### app.js

Configures the Express application: security, middleware, and route mounting.

**Security and parsing**

- `helmet`, `express-mongo-sanitize`, `xss-clean`, `hpp`, `cors` (wide open `origin: *`; `credentials` must stay `false` with `*`).
- JSON body limit **1mb** (`bodyParser.json` + `express.json`).
- Rate limiter: **10,000** requests per IP per hour (applied to routes registered **after** the limiter middleware).
- `trust proxy` set for reverse proxies (e.g. Render, Cloudflare).

**Top-level HTTP endpoints (defined on `app` before routers)**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Smoke test: `{ "jason": "working" }` |
| GET | `/healthz` | Liveness: `{ "status": "ok" }` |
| GET | `/api/v1/cloudflare/stats` | Cloudflare GraphQL analytics (`?from`, `?to`); **60s** in-memory cache; needs `CF_ZONE_ID`, `CF_API_TOKEN` |
| GET | `/api/cloudflare/last24h` | Same stats helper narrowed to the last 24 hours |

**Mounted API groups (order matters: sync and coupon sit *before* the global rate limiter)**

- `/api/v1/coupon` â€” Coupon create/delete/apply and coupon-user listings (`routes/coupon.js`).
- `/api/v1/sync` â€” Sync profile, delta run, import, reconcile (`routes/syncRoutes.js`).
- *(rate limiter applies here)*
- `/api/v1/users` â€” Auth and profiles.
- `/api/v1/merchant` â€” Merchant signup/login, purchase log, analytics (`routes/merchantRoutes.js`).
- `/api/v1/dashboard` â€” Admin dashboard (JWT + admin role on protected routes).
- `/api/v1/orders` â€” Checkout and orders.
- `/api/v1/products` â€” Public product catalog (`routes/productsRoutes.js`).
- `/api/v1/articles` â€” Published articles only; mounted with `requireDbReady({ dependency: "articles" })`.
- `/webhooks` â€” Kinguin webhooks (secret header, not JWT).
- `/api/v1/catalog` â€” Read-only cached catalog list/detail (`routes/kinguinCacheRoutes.js`).

**404 / errors**

- Unmatched routes â†’ `AppError` 404 (`can't find {url}`).
- Global handler: `errorControllers`.

---

## Models

### userModel.js

Defines the User schema for authentication and profiles.

```
Fields:
  fullName         (String)          â€” User's display name
  phone            (String, unique)  â€” Phone number (used as login ID)
  governorate      (String, enum)    â€” Iraqi governorate (Baghdad, Basra, etc.)
  city             (String)          â€” City name
  address          (String)          â€” Street address
  email            (String)          â€” Email (optional, lowercase)
  isActive         (Boolean)         â€” Soft delete flag (default: true)
  profileImage     (String)          â€” URL to profile picture on R2
  role             (String, enum)    â€” "user", "admin", "seller", or "merchant"
  password         (String)          â€” Hashed password (hidden from queries)
  passwordChangedAt (Date)           â€” When password was last changed
  passwordResetToken (String)        â€” Hashed reset token
  passwordResetTokenExp (Date)       â€” Reset token expiry (10 minutes)

Pre-save hooks:
  1. Sets passwordChangedAt when password is modified
  2. Hashes password with bcrypt (12 salt rounds) before saving

Pre-find hook:
  Automatically filters out inactive users (isActive != false)

Methods:
  checkPassword(input, hash)      â€” Compares plain password with hash
  checkChangedPassword(jwtTime)   â€” Returns true if password changed after JWT was issued
  resetPasswordToken()            â€” Generates random token, stores hash, sets 10min expiry
```

### KinguinProduct.js

Stores products synced from the Kinguin API. This is the main product model.

```
Fields:
  _id              (Number)          â€” Kinguin product ID (kinguinId as _id)

  officialStore:                     â€” Price data from IsThereAnyDeal API
    itadGameId     (String)          â€” ITAD game identifier
    shopId         (Number)          â€” Store ID (e.g., 61 = Steam)
    shopName       (String)          â€” Store name (e.g., "Steam")
    url            (String)          â€” Link to buy on official store
    priceAmount    (Number)          â€” Current price on official store
    regularAmount  (Number)          â€” Regular/full price
    cut            (Number)          â€” Discount percentage (0-100)
    lastUpdatedAt  (Date)            â€” When ITAD data was last fetched

  remote:                            â€” Raw data from Kinguin API
    name           (String)          â€” Product name from Kinguin
    description    (String)          â€” Product description
    images         (Mixed)           â€” Cover image, screenshots, etc.
    price          (Number)          â€” Base price in EUR
    qty            (Number)          â€” Stock quantity
    offers         ([Offer])         â€” Merchant offers (offerId, price, qty, merchant)
    regionId       (Number)          â€” Region code
    tags           ([String])        â€” Tags (e.g., "base", "prepaid")
    isCard         (Boolean)         â€” True if gift card/subscription
    platform       (String)          â€” Platform name (original from Kinguin)
    genres         ([String])        â€” Game genres
    activationDetails (String)       â€” How to activate the key
    languages      ([String])        â€” Supported languages
    systemRequirements (Mixed)       â€” PC system requirements
    originalName   (String)          â€” Original game name
    metacriticScore (Number)         â€” Metacritic rating
    releaseDate    (String)          â€” Release date
    publishers     ([String])        â€” Publisher names
    developers     ([String])        â€” Developer names
    videos         (Mixed)           â€” Trailer/gameplay videos
    updatedAt      (Date)            â€” Last update from Kinguin

  overrides:                         â€” Custom overrides (not overwritten by sync)
    name           (String)          â€” Custom display name
    description    (String)          â€” Custom description
    images         (Mixed)           â€” Custom images
    isAd           (Boolean)         â€” Mark as advertisement

  derived:                           â€” Computed fields (set by workers)
    inStock        (Boolean, indexed) â€” Whether product has stock
    priceMin       (Number, indexed)  â€” Minimum price in IQD
    platformCanonical (String, indexed) â€” Normalized platform name

  flags:
    hidden         (Boolean, indexed) â€” Hidden from catalog
    removedAt      (Date)            â€” When product was removed upstream
```

### Orders.js
it is but a  schma
Stores customer orders with payment, Kinguin order, and key delivery data.

```
Sub-schema: keySchema
  serial           (String)          â€” The actual CD key / activation code
  type             (String)          â€” Key type (e.g., "text")
  name             (String)          â€” Product name for this key
  kinguinId        (Number)          â€” Kinguin product ID

Sub-schema: orderItemSchema
  product          (String)          â€” Product ID (as string)
  quantity         (Number)          â€” How many ordered (default: 1)
  unitPrice        (Number)          â€” Price per unit in IQD
  Virtual: detail  â€” Populates full product data from KinguinProduct

Fields:
  user             (ObjectId, ref)   â€” Who placed the order
  products         ([orderItem])     â€” Cart items (array of products)
  product          (String)          â€” Legacy: single product ID
  quantity         (Number)          â€” Legacy: single product quantity
  unitPrice        (Number)          â€” Legacy: single product price
  merchants        (ObjectId, ref)   â€” Seller/reseller (if applicable)
  coupon           (String)          â€” Coupon code used
  discount         (Number)          â€” Discount amount in IQD
  totalPrice       (Number)          â€” Final price in IQD after discount
  waylReference    (String)          â€” Wayl payment reference ID
  country          (String)          â€” Customer country (default: "IQ")
  waylPaymentStatus (String, enum)   â€” "pending", "paid", or "failed"
  kinguinOrderId   (String)          â€” Kinguin order ID after placement
  keys             ([keySchema])     â€” Delivered CD keys
  key              (String)          â€” Legacy: single key field
  status           (String, enum)    â€” Order lifecycle:
                                       "pending"   â†’ Created, waiting for payment
                                       "wayle"     â†’ Payment confirmed by Wayl
                                       "kingwin"   â†’ Order placed with Kinguin
                                       "completed" â†’ Keys delivered
                                       "cancelled" â†’ Order cancelled

Post-query hooks:
  After find/findOne/findOneAndUpdate: attaches product details to each cart item
  by looking up KinguinProduct by numeric ID.
```

### Coupon.js

**MongoDB (`models/Coupon.js`):** legacy/discount schema retained in the codebase.

```
Fields:
  code             (String, unique)  â€” Coupon code (e.g., "SAVE10")
  type             (String, enum)    â€” "percent" or "fixed"
  value            (Number)          â€” Percentage (0-100) or fixed IQD amount
  expiresAt        (Date)            â€” When coupon expires
  active           (Boolean)         â€” Whether coupon is active

Methods:
  applyDiscount(subtotal)            â€” Returns the discount amount in IQD
                                       Returns 0 if inactive or expired
                                       For percent: rounds to nearest integer
```

**PostgreSQL (`post-models/Coupon.js`, table `coupons`):** source of truth for **`/api/v1/coupon`** and checkout coupon validation (`utils/coupon.js`, `applyCoupon`). Fields include:

```
code                (STRING, unique)
type                ("percent" | "fixed")
value               (FLOAT)
expiresAt           (DATE, optional)
active              (BOOLEAN, default true)
users               (JSONB array of user ids) â€” legacy list of redeemers
maxUsesPerUser      (INTEGER, default 1)
userUsageByUserId   (JSONB object: userId â†’ usage count)
```

Discount preview uses `applyCoupon`; **persisted usage** is updated when an order is first marked paid on the Wayl callback (`consumeCouponUsageForOrder` in `orderController.js`), not on `POST /api/v1/coupon/apply`.

### adsModel.js

Advertisements/banners shown on the frontend.

```
Fields:
  title            (String, required) â€” Ad title
  adPicture        (String)           â€” Image URL on R2
  link             (String)           â€” Where the ad links to
  position         (String)           â€” Where to show the ad on the page
  active           (Boolean)          â€” Whether ad is active (default: true)
```

### homeModel.js

Homepage content configuration (single document).

```
Fields:
  mainSection:
    mainTitle      (String)           â€” Hero section title
    subTitle       (String)           â€” Hero section subtitle
    mainImage      (String)           â€” Hero background image URL

  mainCategories:  (Array)            â€” Featured categories on homepage
    title          (String)           â€” Category title
    description    (String)           â€” Category description

  about:
    storeDescription (String)         â€” About us text
    ourPartners    ([String])         â€” Partner names/logos
    aboutImage     (String)           â€” About section image URL

  footer:
    email          (String)           â€” Contact email
    phoneNumber    (String)           â€” Contact phone
    aboutDowera    (String)           â€” About the company text
    socialMediaLinks:
      facebookLink   (String)
      instagramLink  (String)
      twitterLink    (String)
```

### storeModel.js

Stores/merchants for product organization.

```
Fields:
  name             (String, required) â€” Store name
  logoImage        (String)           â€” Logo URL on R2
  description      (String)           â€” Store description

Virtuals:
  productIds       â€” References products belonging to this store
```

### tagsModel.js

Product tags for filtering and organization.

```
Fields:
  name             (String, unique)   â€” Tag name
  color            (String, required) â€” Display color (hex code)

Virtuals:
  productCount     â€” Count of products with this tag
```

### categoriesModel.js

Hierarchical product categories (base and subcategories).

```
Fields:
  name             (String, unique)   â€” Category name
  isFeatured       (Boolean)          â€” Show on homepage
  categoryType     (String, enum)     â€” "base" or "sub"
  baseCategory     (ObjectId, ref)    â€” Parent category (required if type is "sub")
```

### productsModel.js

General product catalog (non-Kinguin products, e.g., physical products).

```
Fields:
  name             (String)           â€” Product name
  isVisible        (Boolean)          â€” Show in catalog (default: true)
  originalPrice    (Number)           â€” Base price
  isBestseller     (Boolean)          â€” Bestseller badge
  isNew            (Boolean)          â€” New product badge
  category         (String)           â€” Category name
  image            (String, required) â€” Product image URL
  sizes            ([{price, size}])  â€” Size/variant options
  description      (String)           â€” Product description
  store            (ObjectId, ref)    â€” Belongs to which store
  productStock     (Number)           â€” Stock quantity
```

### reviewsModel.js

Product reviews with automatic rating aggregation.

```
Fields:
  userName         (String, required) â€” Reviewer name
  date             (String, required) â€” Review date
  rating           (Number, required) â€” Rating score
  product          (ObjectId, ref)    â€” Which product this reviews
  comment          (String)           â€” Review text

Post-save hook:   Recalculates average rating on the product
Post-delete hook: Recalculates average rating after deletion
```

### SyncState.js

Tracks sync configuration and state.

```
SyncProfile schema:
  name             (String, unique)   â€” Profile name (e.g., "default")
  filters          (Mixed)            â€” Filters sent to Kinguin API
  fields           ([String])         â€” Which fields to store

SyncState schema:
  key              (String, unique)   â€” State key (e.g., "lastSync")
  value            (Mixed)            â€” State value (e.g., ISO timestamp)
```

### PhysicalProduct.js & PhysicalOrder.js

Both files are **entirely commented out**. They were intended for physical product sales (non-digital) with seller/admin management but are not currently active.

### Article.js (post-models)

Sequelize model for **CMS articles** (storefront content, help pages, blog-style posts). Stored in PostgreSQL; table name `articles`.

```
Fields:
  id               (UUID, PK)        â€” Primary key
  slug             (String, unique)  â€” URL segment (unique; collisions get -2, -3, â€¦)
  title            (String)          â€” Headline
  excerpt          (TEXT, optional)  â€” Short preview
  body             (TEXT)            â€” Full content (HTML or markdown as stored)
  status           (ENUM)            â€” "draft" or "published" (default: draft)
  publishedAt      (DATE, optional)  â€” Set when published (or on first publish)
  createdAt/updatedAt                 â€” Sequelize timestamps

Indexes:
  (status, publishedAt)              â€” Efficient public listing of published posts
```

Public API only returns rows with `status: "published"`. Admin dashboard can list and edit drafts.

---

## Controllers

### authControllers.js

Handles all authentication: signup, login, JWT tokens, OTP verification, and password management.

```
createToken(userId)
  Creates a JWT signed with JWT_SECRET. Includes user ID and expiration.

signup(role = "user")
  1. If role is "admin", validates admin password from request body
  2. Verifies phone OTP via Twilio Verify service
     - Code "111111" bypasses verification (development shortcut)
  3. Creates user with: fullName, phone, governorate, city, address, password, role
  4. Issues JWT token and sets HTTP cookie
  5. Returns user data and token

login(role = "user")
  1. Requires phone and password in request body
  2. Finds user by phone number (includes password field)
  3. Verifies password using bcrypt
  4. If role is "admin", checks user has admin role
  5. Issues JWT token and sets cookie
  6. Returns user data and token

protect (middleware)
  1. Extracts Bearer token from Authorization header
  2. Verifies JWT signature and expiration
  3. Loads user from database
  4. Checks if password was changed after token was issued
  5. Attaches user to req.user for downstream handlers

onlyPermission(...roles) (middleware)
  Restricts route access to specified roles.
  Returns 403 "Forbidden" if user's role is not in the allowed list.

sendOTP
  Sends SMS OTP to phone via Twilio Verify.
  Checks if user exists first.

updatePasswordWithOld
  Changes password when user knows their current password.
  Requires: currentPassword, newPassword.

requestPasswordResetOtp
  Sends OTP for password reset flow.
  Finds user by phone, sends OTP via Twilio.

updatePasswordWithOtp
  Resets password using OTP code.
  Validates OTP via Twilio (or bypasses with "111111").
  Updates password and issues new JWT.
```

### orderController.js

Manages the complete purchase flow: checkout, payment, Kinguin order placement, and key delivery.

```
createWaylLink(referenceId, amount, productName, image, req)
  Creates a payment link on the Wayl payment gateway.
  1. Converts IQD amount to user's local currency using IP-based detection
  2. Builds Wayl payload with line items, webhook URL, and redirect URL
  3. Calls Wayl API to generate payment link
  4. Appends currency parameter to the payment URL
  5. Returns payment link and FX preview data

kinguinGetBalance()
  Calls Kinguin API to check account balance.
  Used before placing orders to ensure sufficient funds.

kinguinPlaceOrderV2(payload)
  Places an order on Kinguin API.
  Payload: { products: [{ kinguinId, qty, price }], orderExternalId }
  Returns: { orderId } from Kinguin

checkout (POST /api/v1/orders/checkout)
  1. Reads cart array from request body (each item: productId, qty)
  2. Looks up each product in KinguinProduct collection
  3. Validates products exist and have prices
  4. Calculates total price (sum of unitPrice * quantity)
  5. Applies coupon discount if couponCode provided
  6. Checks Kinguin balance is sufficient (converts IQD to EUR)
  7. Creates Order document with status "pending"
  8. Creates Wayl payment link
  9. Saves payment URL on the order
  10. Returns payment URL for frontend redirect

waylCallback (POST /api/v1/orders/wayl-callback)
  Called by Wayl after customer completes payment.
  1. Validates paid status from the webhook payload
  2. Finds order by waylReference
  3. On first transition to paid: markOrderPaidAndConsumeCouponOnce â†’ consumeCouponUsageForOrder
     increments Postgres coupon usage (userUsageByUserId) and updates users[] when the order has a coupon
  4. Updates status to "wayle" (payment confirmed)
  5. Builds Kinguin order payload from cart items
  6. Places order on Kinguin API
  7. Saves kinguinOrderId, updates status to "kingwin"
  8. Returns success

myOrders (GET /api/v1/orders/my)
  Returns current user's orders (completed or kingwin status).
  Sorted by creation date (newest first).

getOrder (GET /api/v1/orders/:id)
  Returns a specific order with full product details.
  If keys haven't been fetched yet:
    1. Calls Kinguin API: GET /v2/order/{kinguinOrderId}/keys
    2. Maps keys to schema (serial, type, name, kinguinId)
    3. Saves keys on the order
    4. Updates status to "completed"
  This is the "lazy fetch" backup for key delivery.
```

### productControllers.js

Handles product listing, search, filtering, and price comparison with official stores. Catalog reads use **Sequelize** against PostgreSQL table `kinguin_products` (`post-models/KinguinProduct.js`), not MongoDB.

```
normStr(s)
  Normalizes strings: lowercase, replaces hyphens/underscores with spaces, trims.

normalizePlatform(p)
  Converts platform names to canonical forms.
  Examples: "Steam" â†’ "pc steam", "Uplay" â†’ "pc ubisoft connect"

buildListQuery(qs)
  Builds a Sequelize WHERE (JSONB on `remote`, `derived`, `overrides`, `flags`) from query parameters.
  Supported filters include:
    platform, regionId, releaseDate / releaseDateFrom / releaseDateTo
    publishers, developers, genres, tags
    priceFrom, priceTo, isAd, isCard, metacriticScore / range, q (name search)
  Always excludes hidden and out-of-stock products (see NOT_HIDDEN_SQL / IN_STOCK_SQL).

listProducts (GET /api/v1/products)
  1. buildListQuery + pagination and sort
  2. Loads rows from KinguinProduct (Postgres)
  3. IQD â†’ visitor currency via convertFromIQD (IP / config)
  4. Optional batch ITAD refresh for official-store pricing (skipped when `q` search is used)
  5. Large JSON payload per item (includes `remote` for debugging)
  6. Each item includes `seo`: `{ lastModified, path }` for sitemap `lastmod` (ISO 8601 from row `updatedAt`) and a stable storefront path (`/games/:kinguinId`), without repeating full descriptions on list rows.

listGiftCards (GET /api/v1/products/gift-cards)
  Sets isCard=true and delegates to listProducts.

listGanraGames (GET /api/v1/products/ganraGames)
  Requires genres. Same WHERE as listProducts; **no** ITAD batch refresh.
  Response items: kinguinId, name, genres, image, currency, price, priceMinIQD, priceFormatted, flags, and `seo` (same shape as listProducts).

listNewGames (GET /api/v1/products/new-games)
  Defaults release window and sort, then delegates to listProducts.

listPopularGames (GET /api/v1/products/popular-games)
  Proxies ITAD popularity data (getMostPopularGames); not a SQL catalog query.

getProduct (GET /api/v1/products/:kinguinId)
  1. Finds product by numeric id
  2. Applies overrides (custom name, description, images)
  3. Converts price to user's currency
  4. Refreshes ITAD official store price if older than 48 hours
  5. Returns full product details
  6. Response `data.seo` (from `utils/productSeo.js`): `title`, `description` (HTML stripped, ~160 chars), cover `image` URL, `robots` (`index, follow`), `path` (`/games/:kinguinId`), `canonicalUrl` (absolute URL when `STOREFRONT_PUBLIC_URL` is set, otherwise `null`)

patchOverrides (PATCH /api/v1/dashboard/products/:kinguinId/overrides)
  Admin (dashboard) endpoint to customize product display.
  Can override: name, description, images, coverImage, isAd flag.
  Overrides persist across syncs (not overwritten by Kinguin data).
```

### syncController.js

Triggers the full product import.

```
startFullImport (POST /api/v1/sync/import)
  1. Checks if import is already running (prevents concurrent imports)
  2. Returns 429 if another import is in progress
  3. Disables request/response timeouts (import can take a long time)
  4. Calls runImportAll() from worker/importAll.js
  5. Waits for completion
  6. Returns stats: { processed, kept, skipped: { name, region, platform, ... } }
  7. Resets running flag in finally block
```

### statsController.js

Aggregates sales data for the admin dashboard.

```
getTopSellingGames (GET /api/v1/dashboard/get-top-selling-games)
  Aggregates top-selling games from completed orders.
  1. Filters by date range (from, to query params)
  2. Normalizes line items (handles legacy single-product orders)
  3. Groups by product ID, sums units sold and revenue
  4. Enriches with product name and cover image
  5. Returns ranked list: [{ productId, name, image, units, revenue }]

getDashboardStats (GET /api/v1/dashboard/stats)
  Returns comprehensive dashboard data using MongoDB $facet aggregation:
  - perOrder:     Total revenue, total purchases, average order value, unique buyers
  - countries:    Orders and revenue grouped by country
  - merchants:    Orders and revenue grouped by reseller
  - monthly:      Monthly breakdown (timezone-aware)
  - perItem:      Top-selling games with product details
  - distributors: Kinguin vs Manual source breakdown
  - suppliers:    Supplier stats merged with catalog product counts
```

### homeController.js

Manages homepage content (single document).

```
getHomeSection    â€” Returns the homepage configuration document
createHomeSection â€” Creates homepage config (only one allowed)
                    Handles mainImage and aboutImage uploads
updateHomeSection â€” Updates homepage config
                    Tracks old images for S3 deletion when replaced
```

### storeController.js

CRUD for stores/merchants.

```
createStore  â€” Creates store with optional logoImage upload
getStores    â€” Lists stores (admins see all fields, others exclude coupons)
getStore     â€” Gets single store by ID
updateStore  â€” Updates store, handles logo image replacement and S3 cleanup
deleteStore  â€” Deletes store and its associated S3 images
```

### adsController.js

CRUD for advertisements/banners.

```
createAd   â€” Creates ad using factory
getAds     â€” Lists all ads with filtering/sorting
getAd      â€” Gets single ad by ID
updateAd   â€” Updates ad, handles image replacement and S3 cleanup
deleteAd   â€” Deletes ad and its S3 image
```

### tagsController.js

CRUD for product tags.

```
getAllTags  â€” Lists tags using factory
getTag     â€” Gets single tag
createTag  â€” Creates tag
updateTag  â€” Updates tag
deleteTag  â€” Deletes tag (prevents deletion if products use it)
```

### userControllers.js

Admin-only user management using factory pattern.

```
createUserAdmin  â€” Creates user (admin)
getUsersAdmin    â€” Lists users with filtering/sorting
getUserAdmin     â€” Gets single user
updateUserAdmin  â€” Updates user
deleteUserAdmin  â€” Deletes user
```

### userDashboardController.js

User profile management (admin and self-service).

```
getMyProfileDetails â€” Gets own profile (admins can view any user)
deleteMe            â€” Self-deactivation (sets isActive: false)
adminDeleteUser     â€” Admin deactivates a user
getUsers            â€” Admin lists all users
```

### userProfileControllers.js

Self-service profile updates.

```
updateProfileData  â€” Updates name, governorate, city, address
updateProfileImage â€” Updates profile picture on R2 (deletes old image)
deleteUser         â€” Self-deactivation
```

### errorControllers.js

Global Express error handling middleware.

```
In development: Returns full error with stack trace
In production:  Returns user-friendly messages for known errors:
  - CastError      â†’ "Invalid {field}: {value}" (400)
  - ValidationError â†’ Field-specific messages (400)
  - Duplicate key   â†’ "Duplicate field value" (400)
  - JWT error       â†’ "Invalid token" (401)
  - Token expired   â†’ "Token expired" (401)
  - Unknown errors  â†’ "Something went wrong" (500)
```

### articleController.js

CMS articles: **public** handlers (published-only listing and by-slug) and **admin** CRUD (all statuses). Uses `catchAsyncErrors`, `AppError`, and helpers `slugify` / `resolveUniqueSlug` for unique slugs.

```
listPublished     â€” GET (public): paginated published articles (?page, ?limit; limit max 50)
getPublishedBySlug â€” GET (public): one published article by slug (404 if missing)
listAdmin         â€” GET (admin): all articles, newest updatedAt first
getById           â€” GET (admin): by UUID
create            â€” POST (admin): requires title + body; optional slug, excerpt, status, publishedAt
update            â€” PATCH (admin): partial fields; slug uniqueness on change; publishedAt rules on publish
delete            â€” DELETE (admin): 204 on success
```

---

## Routes

### userRoutes.js

**Base path:** `/api/v1/users`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/signup` | Public | `authControllers.signup()` | Register new user |
| POST | `/login` | Public | `authControllers.login()` | Login with phone + password |
| POST | `/send-otp` | Public | `authControllers.sendOTP` | Send SMS verification code |
| POST | `/password/request-otp` | Public | `authControllers.requestPasswordResetOtp` | Send password reset OTP |
| POST | `/password/update-with-otp` | Public | `authControllers.updatePasswordWithOtp` | Reset password with OTP |
| POST | `/reset-password` | JWT | `authControllers.updatePasswordWithOld` | Change password (knows old) |
| PATCH | `/profile-data` | JWT | `userControllers.updateProfileData` | Update profile info |
| PATCH | `/profile-image` | JWT | Image middleware + `userControllers.updateProfileImage` | Update avatar |
| DELETE | `/deleteMyAccount` | JWT | `userControllers.deleteUser` | Deactivate account |
| GET | `/me/details` | JWT | `userProfile.getMyProfileDetails` | Get own profile |
| DELETE | `/me` | JWT | `userProfile.deleteMe` | Deactivate account |

### merchantRoutes.js

**Base path:** `/api/v1/merchant`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/signup` | Public | `authControllers.signup("merchant")` | Register merchant (requires `storeName`; creates `merchants` profile) |
| POST | `/login` | Public | `authControllers.login("merchant")` | Login; user must have `role: merchant` |
| GET | `/purchase-log` | JWT merchant | `merchantController.getMyPurchaseLog` | Paginated purchase log (`?page`, `?limit`, `?from`, `?to`) |
| GET | `/analytics/summary` | JWT merchant | `merchantController.getMyAnalyticsSummary` | Totals: gain (base IQD), loss/earnings (discount IQD), order/item counts |
| GET | `/analytics/most-bought` | JWT merchant | `merchantController.getMyMostBoughtItems` | Top products by quantity (`?limit`, `?from`, `?to`) |

### orderRoutes.js

**Base path:** `/api/v1/orders`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/wayl-callback` | Public (Wayl) | `orderCtrl.waylCallback` | Payment webhook from Wayl |
| POST | `/checkout` | JWT | `orderCtrl.checkout` | Create order and get payment link; merchants with an active discount get automatic IQD discount before coupons; per-line rows go to `merchant_purchase_logs` |
| GET | `/my` | JWT | `orderCtrl.myOrders` | List my orders |
| GET | `/:id` | JWT | `orderCtrl.getOrder` | Get order with keys |

### productsRoutes.js

**Base path:** `/api/v1/products`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| GET | `/` | Public | `productsControllers.listProducts` | List/search products (Postgres `kinguin_products`; filters via `buildListQuery`) |
| GET | `/search` | Public | `productsControllers.listProducts` | Temporary alias for legacy frontend search calls |
| GET | `/suggest` | Public | `productsControllers.suggestProducts` | Lightweight autocomplete suggestions for typeahead UX |
| GET | `/new-games` | Public | `productsControllers.listNewGames` | Recent releases (default sort `releaseDate` desc, last 8 years window unless overridden) |
| GET | `/ganraGames` | Public | `productsControllers.listGanraGames` | **Compact** genre listing: `genres` **required**; returns name, price, genres, image, `flags`; same filters as `/` except response shape |
| GET | `/gift-cards` | Public | `productsControllers.listGiftCards` | Same as `/` with `isCard=true` (gift cards / prepaid) |
| POST | `/best-deals` | Public | `productsControllers.listBestDeals` | Returns top discounted games vs official `regularAmount`; requires `minDiscountPercent` in body, optional `limit` (default 20, clamped 1..100), sorted by metacritic score then savings |
| GET | `/popular-games` | Public | `productsControllers.listPopularGames` | ITAD â€œpopular gamesâ€ feed (external API; not the local DB catalog) |
| GET | `/ads` | Public | `adsControllers.getAds` | List advertisements |
| GET | `/ads/:id` | Public | `adsControllers.getAd` | Get single ad |
| GET | `/:kinguinId` (numeric only) | Public | `productsControllers.getProduct` | Get product details |

**SEO:** Main catalog list endpoints (`/`, `/search`, `/new-games`, `/gift-cards`, `/ganraGames`) attach per-item `seo` (`lastModified`, `path`) for sitemap generation; detail `GET /:kinguinId` includes full `data.seo` (title, description, image, robots, `path`, optional `canonicalUrl` when `STOREFRONT_PUBLIC_URL` is set). `/suggest` does not include `seo`. Implemented in [`utils/productSeo.js`](#productseojs).

Compatibility note: `/api/v1/products/search` (full listing alias) and `/api/v1/products/suggest` (autocomplete endpoint) are both kept during frontend migration. Keep `/search` for legacy clients and migrate typeahead flows to `/suggest`.

**`ganraGames` query params:** `genres` (comma-separated, **required**). Other filters match the main list (`page`, `limit`, `q`, `regionId`, `priceFrom`, `priceTo`, `tags`, `sortBy`, `sortType`, etc.).

Optional edition-mode params:

- `uniqueEdition` (`true|false`, default `false`): when `true`, the response keeps one item per normalized base title and removes duplicate editions (deluxe/gold/ultimate/etc. variants).
- `preferredEdition` (`regular|cheapest`, default `regular`): selection rule used only when `uniqueEdition=true`.
  - `regular`: prefer a regular/base candidate first, fallback to cheapest by `derived.priceMin`.
  - `cheapest`: always pick the cheapest candidate by `derived.priceMin`.

Default behavior is unchanged unless `uniqueEdition=true`.

Examples:

- Full set (existing behavior):
  - `GET /api/v1/products/ganraGames?genres=Action,RPG`
- One item per game, regular/base prioritized:
  - `GET /api/v1/products/ganraGames?genres=Action,RPG&uniqueEdition=true&preferredEdition=regular`
- One item per game, always cheapest:
  - `GET /api/v1/products/ganraGames?genres=Action,RPG&uniqueEdition=true&preferredEdition=cheapest`

**`best-deals` body (`POST /api/v1/products/best-deals`):**

- `minDiscountPercent` (required number): `0..100`
- `limit` (optional integer): defaults to `20`, clamped to `1..100`

Behavior:

- Excludes rows without valid `officialStore.regularAmount` (`> 0`)
- Excludes rows without valid `derived.priceMin` and valid `remote.metacriticScore`
- Requires visible + in-stock products only
- Discount rule: `((regularAmount - priceMin) / regularAmount) * 100 >= minDiscountPercent`
- Sort order: `metacriticScore DESC`, then `savingsPercent DESC`, then `id ASC`

Response items include: `kinguinId`, `name`, `image`, `priceMin`, `originalPrice`, `metacriticScore`, `savingsPercent`, and `seo.path` (under `seo`).

Example request bodies:

```json
{ "minDiscountPercent": 50, "limit": 10 }
```

```json
{ "minDiscountPercent": 35.5 }
```

Invalid examples:

```json
{ "minDiscountPercent": -1 }
```

```json
{ "minDiscountPercent": 20, "limit": "abc" }
```

### articlesRoutes.js

**Base path:** `/api/v1/articles` (mounted in `app.js` with `requireDbReady({ dependency: "articles" })`).

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| GET | `/` | Public | `articleController.listPublished` | Paginated **published** articles (`?page`, `?limit`) |
| GET | `/:slug` | Public | `articleController.getPublishedBySlug` | Single **published** article by slug |

No JWT required. Drafts are never exposed here.

### dashboardRoutes.js

**Base path:** `/api/v1/dashboard`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/signup` | Public | `authControllers.signup("admin")` | Admin registration |
| POST | `/login` | Public | `authControllers.login("admin")` | Admin login |
| GET | `/get-top-selling-games` | Public | `statesController.getTopSellingGames` | Top selling games |
| GET | `/stats` | Admin | `statesController.getDashboardStats` | Dashboard statistics |
| GET | `/products` | Admin | `productsControllers.listProducts` | List products |
| GET | `/products/:kinguinId` | Admin | `productsControllers.getProduct` | Get product |
| PATCH | `/products/:kinguinId/overrides` | Admin | `productsControllers.patchOverrides` | Override product data |
| GET | `/orders` | Admin | `ordersControllers.getOrders` | List all orders |
| POST | `/orders/giveaway` | Admin | `ordersControllers.grantGiveawayOrder` | Grant a paid giveaway order to a user and place it on Kinguin |
| GET | `/orders/:orderId` | Admin | `ordersControllers.getOrder` | Get order |
| PATCH | `/orders/:orderId` | Admin | `ordersControllers.updateOrder` | Update order |
| DELETE | `/orders/:orderId` | Admin | `ordersControllers.deleteOrder` | Delete order |
| GET | `/users` | Admin | User CRUD | List users (`?includeMerchant=true` includes `merchantProfile`) |
| POST | `/users` | Admin | User CRUD | Create user |
| GET | `/users/:id` | Admin | User CRUD | Get user |
| PATCH | `/users/:id/role` | Admin | `userDashboardController.updateUserRoleAdmin` | Change user role (`user/admin/seller/merchant`); promoting to merchant requires `storeName` |
| PATCH | `/users/:id` | Admin | User CRUD | Update user (role changes are rejected; use `/users/:id/role`) |
| DELETE | `/users/:id` | Admin | User CRUD | Delete user |
| GET | `/merchants` | Admin | `merchantDashboardController.listMerchants` | List merchant profiles |
| POST | `/merchants` | Admin | `merchantDashboardController.createMerchant` | Create user (`role: merchant`) + merchant row |
| GET | `/merchants/:id` | Admin | `merchantDashboardController.getMerchant` | Get merchant + user |
| PATCH | `/merchants/:id` | Admin | `merchantDashboardController.updateMerchant` | Update merchant profile |
| DELETE | `/merchants/:id` | Admin | `merchantDashboardController.deleteMerchant` | Delete merchant row; demote user to `user` |
| PATCH | `/merchants/:id/discount` | Admin | `merchantDashboardController.updateMerchantDiscount` | Set permanent discount (`percent` or fixed IQD) |
| GET | `/merchants/:id/purchase-log` | Admin | `merchantController.getMerchantPurchaseLogAdmin` | Merchant purchase log |
| GET | `/merchants/:id/analytics/summary` | Admin | `merchantController.getMerchantAnalyticsSummaryAdmin` | Merchant analytics summary |
| GET | `/merchants/:id/analytics/most-bought` | Admin | `merchantController.getMerchantMostBoughtAdmin` | Most-bought items for merchant |
| GET | `/ads` | Admin | Ads CRUD | List ads |
| POST | `/ads` | Admin | Image + Ads CRUD | Create ad |
| GET | `/ads/:adId` | Admin | Ads CRUD | Get ad |
| DELETE | `/ads/:adId` | Admin | Ads CRUD | Delete ad |
| PATCH | `/ads/:adId` | Admin | Image + Ads CRUD | Update ad |
| GET | `/articles` | Admin | `articleController.listAdmin` | List all articles (drafts + published) |
| POST | `/articles` | Admin | `articleController.create` | Create article |
| GET | `/articles/:id` | Admin | `articleController.getById` | Get article by UUID |
| PATCH | `/articles/:id` | Admin | `articleController.update` | Update article |
| DELETE | `/articles/:id` | Admin | `articleController.delete` | Delete article |

Article routes use `requireDbReady({ dependency: "articles" })` like other catalog-backed dashboard endpoints.

`POST /api/v1/dashboard/orders/giveaway` body:

- `userId` (required, UUID): recipient user ID.
- `productId` (required, number): Kinguin product ID to gift.
- `qty` (optional, positive integer, default `1`): gifted quantity.

Auth: admin JWT only (`protect` + `onlyPermission("admin")`).

Behavior:

- Creates an order for the target user with `waylPaymentStatus: "paid"` and no Wayl checkout link.
- Submits the item to Kinguin immediately and stores `kinguinOrderId`.
- Marks the order `status: "kingwin"` on successful Kinguin placement, so it appears in `GET /api/v1/orders/my` (same status filter as normal paid purchases, and later `completed` when keys are delivered).

### syncRoutes.js

**Base path:** `/api/v1/sync`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| GET | `/profile` | None | Inline | Get sync profile (filters, fields) |
| PUT | `/profile` | None | Inline | Update sync profile |
| POST | `/run` | None | `deltaSync.runOnce` | Trigger delta sync |
| POST | `/import` | None | `syncController.startFullImport` | Trigger full import |
| POST | `/reconcile` | None | `reconcile.run` | Reconcile catalog |

### kinguinCacheRoutes.js

**Base path:** `/api/v1/catalog`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| GET | `/` | Public | Inline | Paginated catalog with filters |
| GET | `/:kinguinId` | Public | Inline | Get single cached product |

### coupon.js (routes)

**Base path:** `/api/v1/coupon` (Postgres `Coupon` in `post-models/Coupon.js`; logic in `utils/coupon.js`). Coupon codes are matched case-insensitively (`UPPER(code)`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/create` | None in router | Create coupon (body below). **201** + Sequelize row JSON on success; **400** `{ message }` on error |
| DELETE | `/delete` | None in router | JSON body `{ "code": "<coupon code>" }`. **200** success or **500** `{ message }` |
| POST | `/apply` | None in router | Pricing preview (body below). **200** success or **400** `{ status: "fail", message }` |
| GET | `/:code/users` | None in router | **200** `{ status, users }` or **404** if code unknown; see Usage listing |
| GET | `/:code/users/count` | None in router | **200** `{ status, count }` or **404** if code unknown |

**`POST /create` body**

| Field | Required | Notes |
|-------|----------|--------|
| `type` | Yes | `"percent"` or `"fixed"` |
| `value` | Yes | Percent (0â€“100) or fixed IQD amount |
| `expiresAt` | No | ISO date or `null` |
| `codName` | No | Custom code (normalized to uppercase); if omitted, server generates a segmented code |
| `maxUsesPerUser` | No | Integer â‰¥ 1 (default 1) |

**`POST /apply` body**

| Field | Required | Notes |
|-------|----------|--------|
| `code` | Yes | Coupon code |
| `cartValue` | Yes | Non-negative number (IQD subtotal for discount math) |
| `userId` | Yes* | Required unless JWT sets `req.user._id` or `req.user.id` |

Response includes `discountAmount`, `newCartValue`, and `usageConsumption.consumedOnApply: false` (usage is **not** written on this route).

**Usage listing (`GET /:code/users`, `GET /:code/users/count`)**

Both derive data from **`buildUsageMap`** (`utils/coupon.js`): merge of **`userUsageByUserId`** (numeric per-user counts) and legacy **`users`** array (any user id without a finite map entry counts as **1**). Distinct users = keys of that map.

- **`/users/count`** returns `count` = number of distinct user ids in the merged map.
- **`/users`** returns `{ id, fullName, usageCount }` per id. `fullName` is resolved from Postgres **`Users`**; if the stored id does not match a row in `Users`, `fullName` may be `null` while `usageCount` is still correct.

Until at least one successful **paid** order callback has run with that coupon, maps are usually empty â†’ **`users: []`** and **`count: 0`** even after **`POST /apply`** (apply only validates pricing and limits).

Protect **`/create`** and **`/delete`** in production (admin-only or internal tooling).

Coupon redemption timing:

- `POST /api/v1/coupon/apply` validates eligibility and returns discount math; it does **not** persist usage.
- Per-user usage is incremented when the order is first marked paid in **`POST /api/v1/orders/wayl-callback`** (`markOrderPaidAndConsumeCouponOnce` â†’ `consumeCouponUsageForOrder`).
- Duplicate paid callbacks for the same finalized order do not consume again.

**Data repair / migration**

```bash
npm run backfill:coupon-per-user-usage
```

Merges legacy `users` into `userUsageByUserId` and normalizes `maxUsesPerUser` across existing rows (`backfillCouponPerUserUsage.js`).

**Verification**

```bash
npm run verify:coupon-redemption-timing
```

Requires a reachable Postgres URL; asserts apply-vs-callback consumption and per-user caps.

### sellerRoutes.js

**Base path:** `/api/v1/seller` (router exists in `routes/sellerRoutes.js` but is **not** mounted in `app.js` todayâ€”enable by adding `app.use("/api/v1/seller", sellerRoutes)` when needed).

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/signup` | Public | `authControllers.signup("seller")` | Seller registration |
| POST | `/login` | Public | `authControllers.login("seller")` | Seller login |
| POST | `/products` | Seller/Admin | Physical product CRUD | Create product |
| GET | `/products` | Seller/Admin | Physical product CRUD | List seller products |
| GET/PATCH/DELETE | `/products/:id` | Seller/Admin | Physical product CRUD | Product management |
| GET | `/orders` | Seller/Admin | Physical order CRUD | List seller orders |
| GET/PATCH | `/orders/:id` | Seller/Admin | Physical order CRUD | Order management |

Note: Physical product and order controllers are currently commented out.

### webhooks.js

**Base path:** `/webhooks`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/kinguin/product-update` | Secret header | Delta sync trigger | Kinguin product changed |
| POST | `/kinguin/order-complete` | Secret header | Fetch keys + complete | Kinguin order done |
| POST | `/kinguin/order-status` | Secret header | Status update handler | Order status changed |

Authentication uses `WEBHOOK_SECRET` via `X-Kinguin-Secret` header (not JWT).

---

## Workers

### importAll.js

Full catalog import from Kinguin ESA API to MongoDB. Run manually for initial setup.

```
Configuration (lines 36-51):
  KINGUIN_BASE     â€” API base URL (https://gateway.kinguin.net/esa/api)
  KINGUIN_KEY      â€” API key from environment
  PAGE_SIZE        â€” Products per page (100, API maximum)
  CONCURRENCY      â€” Parallel page fetchers (default: 10)
  EUR_TO_IQD       â€” Exchange rate (default: 1535)
  IQD_MARKUP       â€” Fixed markup in IQD (default: 5800)

Strict filtering rules (lines 53-127):
  ALLOWED_REGION_IDS   â€” [3, 5, 19, 21, 24, 28, 30, 34, 40, 55, 56, 58, 80]
  ALLOWED_PLATFORMS    â€” PC Steam, PC Epic, Xbox, PlayStation, Nintendo, etc.
  ALLOWED_GENRES       â€” Action, Adventure, RPG, FPS, etc. (27 genres)
  BLACKLIST_GENRES     â€” Adult Games, Software, Subscription, etc.
  NAME_REQUIRE_RE      â€” Must contain "CD Key" (for non-card products)
  NAME_EXCLUDE_RE      â€” Must NOT contain "account"
  CARD_TITLE_WHITELIST â€” Exact titles for gift cards/subscriptions

Platform normalization (lines 128-263):
  Converts varied platform names to canonical forms.
  "Steam" â†’ "PC Steam", "Uplay" â†’ "PC Ubisoft Connect", etc.
  Uses synonym map + regex fallbacks.

Price conversion (lines 288-333):
  For games:  priceIQD = (minEUR * EUR_TO_IQD) + IQD_MARKUP
  For cards:  priceIQD = (minEUR * EUR_TO_IQD) + 800 + (3% of base)
  minEUR is the minimum of product.price and all offers[].price.

HTTP retry (lines 336-361):
  Retries on 429 (rate limit) and 5xx (server error).
  Exponential backoff: 400ms, 800ms, 1600ms, 3200ms, 5000ms max.
  Random jitter to prevent thundering herd.

fetchPage(page) (lines 364-392):
  Fetches one page of products from: GET /v1/products?limit=100&page=N
  Sends API key in X-Api-Key header.
  Handles ESA quirk where withText parameter may be rejected.

runImportAll() (lines 395-867):
  Main function:
  1. Connects to MongoDB
  2. Fetches page 1 to get total product count
  3. Calculates total pages
  4. For each product on each page, applies strict gates:
     a. Name check (CD Key required, no "account", card whitelist)
     b. Banned merchant check
     c. Region check (allowed regions only)
     d. Genre check (blacklist then allow-list)
     e. Platform check (normalize + allow-list)
     f. Price check (must exist, < â‚¬130)
  5. For products that pass: builds remote + derived data
  6. Upserts to MongoDB using bulkWrite (batch operations)
  7. Processes pages concurrently (10 workers)
  8. Logs progress and final statistics

CLI usage: node worker/importAll.js
```

### deltaSync.js

Incremental sync: fetches only products changed since last sync.

```
Same filtering rules as importAll.js but additionally:
  - Reads last sync timestamp from SyncState collection
  - Fetches only products with updatedSince parameter
  - Subtracts overlapMinutes (default: 10) for safety margin
  - Filters out banned merchants from offers
  - Updates sync timestamp after completion
  - Includes repriceAll() function (currently disabled) for FX rate changes

runOnce({ overlapMinutes }) (line 661):
  1. Reads SyncState for lastSync timestamp
  2. Calculates sinceISO = lastSync - overlapMinutes
  3. Fetches changed products from Kinguin API
  4. Applies same strict filtering as importAll
  5. Additionally filters banned merchants from offers
  6. Upserts to MongoDB
  7. Saves new lastSync timestamp

CLI usage: node worker/deltaSync.js
```

### reconcile.js

Hides products that were removed from Kinguin's catalog.

```
run():
  1. Fetches ALL products from Kinguin API (like importAll)
  2. Applies same filtering rules
  3. Builds a Set of valid product IDs
  4. Compares with local database
  5. Products not in upstream â†’ sets flags.hidden = true
  6. Products that reappear â†’ sets flags.hidden = false

CLI usage: node worker/reconcile.js
```

### scheduler.js

Internal cron job that runs deltaSync on a schedule.

```
Line 6:   Loads environment variables
Line 7:   Imports node-cron for scheduling
Line 8:   Imports runOnce from deltaSync

Line 13:  Schedule: process.env.SYNC_SCHEDULE or "*/30 * * * * *" (every 30 seconds)
          Format: second minute hour day month weekday

Line 17-33: cron.schedule() registers the job:
            1. Logs start time
            2. Calls runOnce({ overlapMinutes: 10 })
            3. Logs duration and number of updated products
            4. Catches and logs errors

Line 35-46: Graceful shutdown handlers:
            SIGTERM/SIGINT â†’ stops cron job, exits cleanly
```

---

## Utilities

### APIFeatures.js

Query builder class for MongoDB. Attaches to Mongoose queries.

```
filter()       â€” Converts URL params to MongoDB operators:
                 ?price[gte]=100 â†’ { price: { $gte: 100 } }
                 Supports: gte, gt, lte, lt, in

sort()         â€” ?sort=price,-name â†’ .sort("price -name")
                 Default: -createdAt (newest first)

selectFields() â€” ?fields=name,price â†’ .select("name price")

paginate()     â€” Currently disabled (commented out)
```

### appError.js

Custom error class for operational errors.

```
new appError("message", statusCode)
  - statusCode: HTTP status (400, 401, 404, 500, etc.)
  - status: "fail" for 4xx, "error" for 5xx
  - isOperational: true (distinguishes from programming errors)
```

### catchAsyncErrors.js

Wrapper for async route handlers. Catches promise rejections and passes to Express error handler.

```
Usage: router.get("/path", catchAsyncErrors(async (req, res, next) => { ... }))
```

### currency.js

Converts IQD prices to the user's local currency based on IP geolocation.

```
convertFromIQD(req, iqdAmount):
  1. Detects user IP from request headers
  2. Geolocates IP to country code using ipwho.is API
  3. Maps country to currency using REST Countries API (cached 7 days)
  4. Gets IQD â†’ target currency exchange rate (cached 1 hour)
     - Primary: Fawaz Ahmed free FX API
     - Fallback A: Cross-rate via USD
     - Fallback B: Open Exchange Rates API
  5. Returns converted amount and metadata
  6. Falls back to IQD if any step fails

Override: ?currency=USD or X-Currency header
```

### handlerFactory.js

Generic CRUD handler factory. Creates Express handlers for any Mongoose model.

```
deleteOne(Model)  â€” DELETE /:id â†’ Deletes document, returns 204
updateOne(Model)  â€” PATCH /:id  â†’ Updates document (blocks password changes)
createOne(Model)  â€” POST /      â†’ Creates document, returns 201
getOne(Model)     â€” GET /:id    â†’ Gets document with optional populate
getAll(Model)     â€” GET /       â†’ Lists with filtering, sorting, pagination
                    Supports: category filter, tags filter, text search
                    Populates: category, tags, reviews, baseCategory
```

### imageUploadMiddleware.js

Handles image uploads to Cloudflare R2 (S3-compatible storage).

```
createImageProcessingMiddleware(options):
  Returns [uploadMiddleware, processMiddleware]
  1. Multer receives file from form-data
  2. Sharp resizes image (default: 500x500, cover fit)
  3. Converts to JPEG (quality: 90)
  4. Uploads to R2 bucket
  5. Sets req.body[fieldName] to the R2 URL

createMultiImageProcessingMiddleware(options):
  Same but handles up to 10 images. Returns array of URLs.
```

### itadClient.js

Client for IsThereAnyDeal API (official game store price comparison).

```
lookupGameIdsByTitle(titles)  â€” Maps game titles to ITAD IDs
getPricesByGameIds(gameIds)   â€” Gets prices for multiple games
getOfficialDealForTitle(title) â€” Gets best deal from official stores:
  Returns: { shopName, url, priceAmount, regularAmount, cut, ... }
  Used to show "Available on Steam for $X" comparisons.
```

### platforms.js

Platform name normalization and ITAD shop ID mapping.

```
PLATFORM_SYNONYMS  â€” Map of platform variants â†’ canonical names
normalizePlatform() â€” Converts platform string to canonical form
getShopIdsForPlatform() â€” Returns ITAD shop IDs for a platform
  Example: "PC Steam" â†’ [61], "PC Epic Games" â†’ [16]
```

### productSeo.js

Builds **SEO** and **sitemap-oriented** fields for public product JSON (`GET /api/v1/products`, `GET /api/v1/products/ganraGames`, `GET /api/v1/products/:kinguinId`). No new routes; helpers are used from `productControllers.js`.

```
stripHtmlToText / truncateMetaDescription â€” Plain-text meta description from HTML
resolveCoverImageUrl â€” Cover image URL (overrides vs remote.images.cover)
buildProductSeoDetail â€” Full `seo` object on product detail
buildProductSeoListItem â€” `{ lastModified, path }` on each list row
```

Optional env: **`STOREFRONT_PUBLIC_URL`** â€” public site origin (no trailing slash required); when set, detail responses include absolute `seo.canonicalUrl`. If unset, `canonicalUrl` is `null` and clients may join `path` with their own base URL.

### s3Utils.js & deleteR2File.js

Delete files from Cloudflare R2 storage. Both files export the same function.

```
deleteS3ObjectFromUrl(fileUrl):
  1. Parses the R2 URL to extract the object key
  2. Sends DeleteObjectCommand to R2 via AWS SDK
  3. Logs success or error
```

### deletefiles.js

Deletes local files from the filesystem.

```
deleteFiles(paths, next):
  Deletes array of file paths using fs/promises.unlink.
```

### parseJsonBodyMiddleware.js

Parses JSON from multipart form-data requests.

```
parseJsonBody(req, res, next):
  When content-type is multipart/form-data and req.body.json exists:
  1. Parses the JSON string
  2. Merges fields into req.body
  3. Deletes req.body.json
  Used for endpoints that accept both files and JSON data.
```

### validationMiddleware.js

Validates that referenced categories and tags exist in the database.

```
validateCategoryExists â€” Checks req.body.category exists in Categories collection
validateTagsExist      â€” Checks all req.body.tags IDs exist in Tags collection
```

### coupon.js (utils)

**File:** `utils/coupon.js` â€” Postgres coupon helpers used by `routes/coupon.js` and checkout (`applyCoupon` is required from `orderController.js`).

```
normalizeCouponCode / normalizeUserId â€” trim + uppercase code / trim user id (internal)

buildUsageMap(coupon) â€” Exported. Canonical usage map:
  - Starts from userUsageByUserId (object shallow-cloned)
  - For each id in legacy users[]: if no finite numeric count exists for that id, sets count to 1
  - Used by GET /:code/users, GET /:code/users/count, and applyCoupon limit checks

applyCoupon(code, cartValue, userId) â€” Loads coupon from DB (case-insensitive code);
  checks active, expiry, maxUsesPerUser against buildUsageMap, type/value;
  returns { code, discount } (discount capped at cart value). Does not UPDATE the coupon row.

createCoupon(type, value, expiresAt, codName, maxUsesPerUser) â€” INSERT; codName optional custom code

deleteCoupon(code) â€” DELETE by code as stored

generateCouponCode â€” Internal loop using coupon-code package until a DB-unique code exists
```

---

## Library

### kinguinClient.js

Preconfigured Axios client for the Kinguin ESA API.

```
client      â€” Axios instance with base URL and API key header pre-set
withRetry() â€” Retries failed requests (429, 5xx) with exponential backoff
              Up to 4 retries, 2s base delay, 15s max, random jitter
isoNowZ()   â€” Returns ISO timestamp without milliseconds: "2025-01-27T10:00:00Z"
```

---

## Configuration

### render.yaml

Render.com deployment configuration. Defines two cron jobs:

```
gw-sync-run:
  Schedule: */2 * * * * (every 2 minutes)
  Action: Calls POST /api/v1/sync/run via curl
  Purpose: Keeps product catalog up-to-date
  Retries: 3 attempts, 5s delay, 100s max

gw-sync-reconcile:
  Schedule: 0 0 * * * (daily at midnight UTC)
  Action: Calls POST /api/v1/sync/reconcile via curl
  Purpose: Hides products removed from Kinguin
  Retries: 3 attempts, 5s delay, 300s max
```

### Environment Variables

```
# Database
MONGODB_URI              â€” MongoDB connection string
MONGODB_DB               â€” Database name

# PostgreSQL (Sequelize / post-models: catalog, CMS articles, orders)
POSTGRES_URI or DATABASE_URL â€” Connection URI (or POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD)
DB_INIT_ON_STARTUP       â€” When "true", runs sequelize.sync() on startup (creates tables such as `articles`, `kinguin_products`)
EXIT_ON_STARTUP_DB_FAILURE â€” Optional: exit process if DB schema is not ready

# Authentication
JWT_SECRET               â€” Secret for signing JWT tokens
JWT_EXPIRES_IN           â€” Token expiration (e.g., "90d")
JWT_COOKIE_EXPIRES_IN    â€” Cookie expiration in days
ADMIN_PASSWORD           â€” Password required for admin signup

# Kinguin API
KINGUIN_API_BASE         â€” Kinguin API base URL
KINGUIN_API_KEY          â€” Kinguin API key

# Wayl Payment Gateway
WAYL_AUTH_KEY            â€” Wayl authentication key
WAYL_BASE                â€” Wayl API base URL
WAYL_SECRET              â€” Wayl webhook secret
WAYL_r                   â€” Wayl webhook callback URL

# Twilio (OTP)
TWILIO_ACCOUNT_SID       â€” Twilio account SID
TWILIO_AUTH_TOKEN         â€” Twilio auth token
TWILIO_SERVICE_SID       â€” Twilio Verify service SID

# Cloudflare R2 (Image Storage)
R2_ACCESS_KEY_ID         â€” R2 access key
R2_SECRET_ACCESS_KEY     â€” R2 secret key
R2_BUCKET_NAME           â€” R2 bucket name
R2_ENDPOINT              â€” R2 endpoint URL
R2_BUCKET_PATH           â€” Base path in bucket
AWS_REGION               â€” Region (e.g., "auto")

# Cloudflare Analytics
CF_ZONE_ID               â€” Cloudflare zone ID
CF_API_TOKEN             â€” Cloudflare API token

# IsThereAnyDeal
ITAD_API_KEY             â€” ITAD API key
ITAD_DEFAULT_COUNTRY     â€” Default country for price lookup (e.g., "US")

# Sync Configuration
SYNC_PAGE_SIZE           â€” Products per page (default: 100)
SYNC_CONCURRENCY         â€” Parallel workers (default: 10)
SYNC_OVERLAP_MINUTES     â€” Overlap window for delta sync (default: 10)
SYNC_SCHEDULE            â€” Cron schedule for internal scheduler
ENABLE_INTERNAL_SCHEDULER â€” "true" to enable internal cron

# Pricing
EUR_TO_IQD               â€” EUR to IQD exchange rate (default: 1535)
IQD_MARKUP               â€” Fixed markup in IQD (default: 5800)

# Storefront / SEO (optional)
STOREFRONT_PUBLIC_URL    â€” Public website origin for product `seo.canonicalUrl` (e.g. https://yoursite.com). Omit trailing slash. If unset, `canonicalUrl` is null and the frontend can build absolute URLs from `seo.path`.

# Webhooks
WEBHOOK_SECRET           â€” Secret for Kinguin webhook verification
```

### Example deployment (optional)

A typical hosted instance exposes:

- `GET /` â†’ `{ "jason": "working" }` (smoke test)
- `GET /healthz` â†’ `{ "status": "ok" }`

**Docker / Coolify / Contabo:** see [deploy/COOLIFY.md](./deploy/COOLIFY.md) and [deploy/CONTABO.md](./deploy/CONTABO.md). Copy [`.env.example`](./.env.example) to `.env` on the server.

Example staging host used for integration checks: `https://stage-backend.gamewiseiq.com` (replace with your own production URL in real docs).

---

## Order Flow

How a purchase works end-to-end:

```
1. USER adds products to cart on the frontend

2. FRONTEND calls POST /api/v1/orders/checkout
   Body: { cart: [{ productId: 12345, qty: 1 }], couponCode: "SAVE10" }

3. BACKEND (checkout):
   a. Looks up each product in KinguinProduct
   b. Calculates total price in IQD
   c. Applies coupon discount
   d. Checks Kinguin balance is sufficient
   e. Creates Order document (status: "pending")
   f. Creates Wayl payment link
   g. Returns payment URL to frontend

4. FRONTEND redirects user to Wayl payment page

5. USER completes payment on Wayl

6. WAYL calls POST /api/v1/orders/wayl-callback
   Body: { referenceId: "WAYL-1234..." }

7. BACKEND (waylCallback):
   a. Finds order by waylReference
   b. On first paid transition: persists coupon usage on Postgres coupons (per-user counts + users list) when the order has a coupon code
   c. Updates status to "wayle" (payment confirmed)
   d. Builds Kinguin order payload
   e. Calls Kinguin API to place order
   f. Saves kinguinOrderId, status â†’ "kingwin"

8. KINGUIN processes the order and prepares keys

9. KINGUIN calls POST /webhooks/kinguin/order-complete
   Body: { orderId: "..." }

10. BACKEND (order-complete webhook):
    a. Finds order by kinguinOrderId
    b. Calls Kinguin API: GET /v2/order/{id}/keys
    c. Saves keys on the order
    d. Updates status â†’ "completed"

11. USER opens their order page
    â†’ Frontend calls GET /api/v1/orders/:id
    â†’ Backend returns order with keys (CD keys visible)

12. BACKUP: If webhook was missed, getOrder lazily fetches keys
    from Kinguin when the user views the order.
```

---

## Sync Flow

How products are imported and kept up-to-date:

```
INITIAL SETUP (run once):
  POST /api/v1/sync/import  OR  node worker/importAll.js
  â†’ Fetches ALL products from Kinguin (thousands of pages)
  â†’ Filters by region, platform, genre, name, price
  â†’ Converts EUR â†’ IQD
  â†’ Stores in PostgreSQL `kinguin_products` (and related sync state)

ONGOING SYNC (every 2 minutes via Render cron):
  POST /api/v1/sync/run  OR  node worker/deltaSync.js
  â†’ Reads lastSync timestamp from database
  â†’ Fetches only products updated since lastSync - 10min overlap
  â†’ Applies same filters
  â†’ Updates existing products or inserts new ones
  â†’ Saves new lastSync timestamp

DAILY RECONCILIATION (midnight UTC):
  POST /api/v1/sync/reconcile  OR  node worker/reconcile.js
  â†’ Fetches ALL valid product IDs from Kinguin
  â†’ Compares with local database
  â†’ Hides products no longer in Kinguin (flags.hidden = true)
  â†’ Unhides products that reappear

INTERNAL SCHEDULER (optional):
  Runs deltaSync automatically within the Node.js process
  Schedule configurable via SYNC_SCHEDULE env var
  Default: every 30 seconds (or every 2 minutes)
```

---

## DB Startup Readiness

For Postgres-backed catalog routes (`/api/v1/products`, `/api/v1/catalog`, `/api/v1/articles`, and catalog-dependent dashboard/order endpoints), startup now enforces schema readiness:

- Set `DB_INIT_ON_STARTUP=true` for at least one deployment when bootstrapping a new environment.
- Startup logs include resolved values for `DB_INIT_ON_STARTUP` and `EXIT_ON_STARTUP_DB_FAILURE`.
- Startup verifies `public.kinguin_products` exists; if missing, the service stays degraded (or exits when `EXIT_ON_STARTUP_DB_FAILURE=true`).
- While degraded, catalog-dependent routes return controlled `503` responses with startup state details.

Post-deploy validation command:

```bash
npm run validate:kinguin-startup
```

Optional endpoint checks can be enabled with:

```bash
POST_DEPLOY_BASE_URL=https://stage-backend.gamewiseiq.com npm run validate:kinguin-startup
```

(Replace with your own API base URL.)
