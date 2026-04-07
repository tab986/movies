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
   - [s3Utils.js & deleteR2File.js](#s3utilsjs--deleter2filejs)
   - [deletefiles.js](#deletefilesjs)
   - [parseJsonBodyMiddleware.js](#parsejsonbodymiddlewarejs)
   - [validationMiddleware.js](#validationmiddlewarejs)
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
├── server.js                  # Entry point: starts server, connects DB
├── app.js                     # Express app config, middleware, route mounting
├── config.env                 # Environment variables (not in repo)
├── render.yaml                # Render.com deployment config (cron jobs)
├── package.json               # Dependencies
│
├── controllers/               # Business logic for each feature
│   ├── authControllers.js     # Signup, login, JWT, OTP, password reset
│   ├── orderController.js     # Checkout, payment callback, key delivery
│   ├── productControllers.js  # Product listing, search, price comparison
│   ├── syncController.js      # Triggers full import
│   ├── statsController.js     # Dashboard analytics and stats
│   ├── homeController.js      # Homepage content management
│   ├── storeController.js     # Store/merchant CRUD
│   ├── adsController.js       # Advertisement CRUD
│   ├── articleController.js   # CMS articles (public + admin)
│   ├── tagsController.js      # Tag management
│   ├── userControllers.js     # Admin user management
│   ├── userDashboardController.js  # User profile (admin view)
│   ├── userProfileControllers.js   # User profile (self-service)
│   └── errorControllers.js    # Global error handler
│
├── post-models/               # Sequelize models (PostgreSQL)
│   ├── Article.js             # CMS articles (blog/content)
│   ├── KinguinProduct.js      # Cached Kinguin catalog
│   └── ...                    # Other Sequelize models
│
├── models/                    # Mongoose schemas
│   ├── userModel.js           # User accounts (phone auth, roles)
│   ├── KinguinProduct.js      # Cached Kinguin products
│   ├── Orders.js              # Orders with cart, keys, payment status
│   ├── Coupon.js              # Discount coupons
│   ├── adsModel.js            # Advertisements/banners
│   ├── homeModel.js           # Homepage content
│   ├── storeModel.js          # Stores/merchants
│   ├── tagsModel.js           # Product tags
│   ├── categoriesModel.js     # Product categories
│   ├── productsModel.js       # General products (non-Kinguin)
│   ├── reviewsModel.js        # Product reviews
│   └── SyncState.js           # Sync timestamps and profiles
│
├── routes/                    # API endpoint definitions
│   ├── userRoutes.js          # /api/v1/users
│   ├── orderRoutes.js         # /api/v1/orders
│   ├── productsRoutes.js      # /api/v1/products
│   ├── articlesRoutes.js      # /api/v1/articles (public CMS reads)
│   ├── dashboardRoutes.js     # /api/v1/dashboard
│   ├── syncRoutes.js          # /api/v1/sync
│   ├── kinguinCacheRoutes.js  # /api/v1/catalog
│   ├── sellerRoutes.js        # /api/v1/seller
│   └── webhooks.js            # /webhooks/kinguin/*
│
├── worker/                    # Background sync workers
│   ├── importAll.js           # Full catalog import from Kinguin
│   ├── deltaSync.js           # Incremental sync (only changed products)
│   ├── reconcile.js           # Hide removed products
│   └── scheduler.js           # Cron scheduler for deltaSync
│
├── utils/                     # Helper utilities
│   ├── APIFeatures.js         # Query filtering, sorting, pagination
│   ├── appError.js            # Custom error class
│   ├── catchAsyncErrors.js    # Async error wrapper
│   ├── currency.js            # IQD currency conversion
│   ├── handlerFactory.js      # Generic CRUD handlers
│   ├── imageUploadMiddleware.js # Image upload to R2
│   ├── itadClient.js          # IsThereAnyDeal API client
│   ├── platforms.js           # Platform normalization
│   ├── s3Utils.js             # R2/S3 file deletion
│   ├── deleteR2File.js        # R2 file deletion (duplicate)
│   ├── deletefiles.js         # Local file deletion
│   ├── parseJsonBodyMiddleware.js # JSON parsing from form-data
│   └── validationMiddleware.js    # Category/tag validation
│
├── lib/                       # External API clients
│   └── kinguinClient.js       # Axios client for Kinguin API
│
└── public/                    # Static files
    └── images/                # Uploaded images
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

```
Line 1-11:  Imports all route files and dependencies.

Line 15-16: Imports security packages:
            - express-rate-limit: Limits requests per IP
            - helmet: Sets security HTTP headers
            - express-mongo-sanitize: Prevents MongoDB injection attacks
            - xss-clean: Sanitizes user input against XSS
            - hpp: Prevents HTTP parameter pollution
            - cors: Enables Cross-Origin Resource Sharing

Line 24:    Creates the Express app instance.

Line 27-31: Rate limiter config: max 10,000 requests per IP per hour.

Line 35:    helmet() adds security headers (X-Content-Type-Options, etc.)

Line 40-41: JSON body parsing (`bodyParser.json` and `express.json`). Accepts JSON payloads up to **1mb** (needed for CMS article bodies).

Line 40:    mongoSanitize() strips $ and . from user input to prevent
            MongoDB query injection (e.g., { "$gt": "" } in login).

Line 41:    xss() sanitizes HTML in user input to prevent script injection.

Line 42:    hpp() cleans up duplicate query parameters.

Line 48-54: CORS configuration: allows requests from any origin (*).
            All HTTP methods allowed (GET, POST, PUT, DELETE, PATCH, OPTIONS).

Line 57:    Trusts proxy headers (X-Forwarded-For) for correct client IP detection.
            Important when running behind Render/Cloudflare.

Line 60:    Serves static files from the public/ directory (uploaded images).

Line 62-65: Health check endpoint: GET / returns { jason: "working" }.

Line 74-76: In-memory cache for Cloudflare stats (60 second TTL).

Line 83-190: GET /api/v1/cloudflare/stats
             Fetches website analytics from Cloudflare GraphQL API.
             Returns daily requests, unique visitors, bytes, cached data, threats.
             Supports date range filtering via ?from and ?to query params.
             Defaults to last 7 days. Results are cached for 60 seconds.

Line 201:   Mounts sync routes at /api/v1/sync (BEFORE rate limiter).
            This ensures sync operations are not rate-limited.

Line 203:   Applies rate limiter to all routes below this line.

Line ~215-223: Mounts all route groups:
              - /api/v1/users      → User auth and profiles
              - /api/v1/dashboard  → Admin dashboard
              - /api/v1/orders     → Order management
              - /api/v1/products   → Product catalog
              - /api/v1/articles   → Public CMS articles (published only; `requireDbReady`)
              - /webhooks          → Kinguin webhooks
              - /api/v1/catalog    → Cached product catalog

Line 216-218: 404 handler: any unmatched route returns "can't find {url}".

Line 220:   Global error handler middleware (errorControllers).
```

---

## Models

### userModel.js

Defines the User schema for authentication and profiles.

```
Fields:
  fullName         (String)          — User's display name
  phone            (String, unique)  — Phone number (used as login ID)
  governorate      (String, enum)    — Iraqi governorate (Baghdad, Basra, etc.)
  city             (String)          — City name
  address          (String)          — Street address
  email            (String)          — Email (optional, lowercase)
  isActive         (Boolean)         — Soft delete flag (default: true)
  profileImage     (String)          — URL to profile picture on R2
  role             (String, enum)    — "user", "admin", or "seller"
  password         (String)          — Hashed password (hidden from queries)
  passwordChangedAt (Date)           — When password was last changed
  passwordResetToken (String)        — Hashed reset token
  passwordResetTokenExp (Date)       — Reset token expiry (10 minutes)

Pre-save hooks:
  1. Sets passwordChangedAt when password is modified
  2. Hashes password with bcrypt (12 salt rounds) before saving

Pre-find hook:
  Automatically filters out inactive users (isActive != false)

Methods:
  checkPassword(input, hash)      — Compares plain password with hash
  checkChangedPassword(jwtTime)   — Returns true if password changed after JWT was issued
  resetPasswordToken()            — Generates random token, stores hash, sets 10min expiry
```

### KinguinProduct.js

Stores products synced from the Kinguin API. This is the main product model.

```
Fields:
  _id              (Number)          — Kinguin product ID (kinguinId as _id)

  officialStore:                     — Price data from IsThereAnyDeal API
    itadGameId     (String)          — ITAD game identifier
    shopId         (Number)          — Store ID (e.g., 61 = Steam)
    shopName       (String)          — Store name (e.g., "Steam")
    url            (String)          — Link to buy on official store
    priceAmount    (Number)          — Current price on official store
    regularAmount  (Number)          — Regular/full price
    cut            (Number)          — Discount percentage (0-100)
    lastUpdatedAt  (Date)            — When ITAD data was last fetched

  remote:                            — Raw data from Kinguin API
    name           (String)          — Product name from Kinguin
    description    (String)          — Product description
    images         (Mixed)           — Cover image, screenshots, etc.
    price          (Number)          — Base price in EUR
    qty            (Number)          — Stock quantity
    offers         ([Offer])         — Merchant offers (offerId, price, qty, merchant)
    regionId       (Number)          — Region code
    tags           ([String])        — Tags (e.g., "base", "prepaid")
    isCard         (Boolean)         — True if gift card/subscription
    platform       (String)          — Platform name (original from Kinguin)
    genres         ([String])        — Game genres
    activationDetails (String)       — How to activate the key
    languages      ([String])        — Supported languages
    systemRequirements (Mixed)       — PC system requirements
    originalName   (String)          — Original game name
    metacriticScore (Number)         — Metacritic rating
    releaseDate    (String)          — Release date
    publishers     ([String])        — Publisher names
    developers     ([String])        — Developer names
    videos         (Mixed)           — Trailer/gameplay videos
    updatedAt      (Date)            — Last update from Kinguin

  overrides:                         — Custom overrides (not overwritten by sync)
    name           (String)          — Custom display name
    description    (String)          — Custom description
    images         (Mixed)           — Custom images
    isAd           (Boolean)         — Mark as advertisement

  derived:                           — Computed fields (set by workers)
    inStock        (Boolean, indexed) — Whether product has stock
    priceMin       (Number, indexed)  — Minimum price in IQD
    platformCanonical (String, indexed) — Normalized platform name

  flags:
    hidden         (Boolean, indexed) — Hidden from catalog
    removedAt      (Date)            — When product was removed upstream
```

### Orders.js
it is but a  schma
Stores customer orders with payment, Kinguin order, and key delivery data.

```
Sub-schema: keySchema
  serial           (String)          — The actual CD key / activation code
  type             (String)          — Key type (e.g., "text")
  name             (String)          — Product name for this key
  kinguinId        (Number)          — Kinguin product ID

Sub-schema: orderItemSchema
  product          (String)          — Product ID (as string)
  quantity         (Number)          — How many ordered (default: 1)
  unitPrice        (Number)          — Price per unit in IQD
  Virtual: detail  — Populates full product data from KinguinProduct

Fields:
  user             (ObjectId, ref)   — Who placed the order
  products         ([orderItem])     — Cart items (array of products)
  product          (String)          — Legacy: single product ID
  quantity         (Number)          — Legacy: single product quantity
  unitPrice        (Number)          — Legacy: single product price
  merchants        (ObjectId, ref)   — Seller/reseller (if applicable)
  coupon           (String)          — Coupon code used
  discount         (Number)          — Discount amount in IQD
  totalPrice       (Number)          — Final price in IQD after discount
  waylReference    (String)          — Wayl payment reference ID
  country          (String)          — Customer country (default: "IQ")
  waylPaymentStatus (String, enum)   — "pending", "paid", or "failed"
  kinguinOrderId   (String)          — Kinguin order ID after placement
  keys             ([keySchema])     — Delivered CD keys
  key              (String)          — Legacy: single key field
  status           (String, enum)    — Order lifecycle:
                                       "pending"   → Created, waiting for payment
                                       "wayle"     → Payment confirmed by Wayl
                                       "kingwin"   → Order placed with Kinguin
                                       "completed" → Keys delivered
                                       "cancelled" → Order cancelled

Post-query hooks:
  After find/findOne/findOneAndUpdate: attaches product details to each cart item
  by looking up KinguinProduct by numeric ID.
```

### Coupon.js

Discount coupons for checkout.

```
Fields:
  code             (String, unique)  — Coupon code (e.g., "SAVE10")
  type             (String, enum)    — "percent" or "fixed"
  value            (Number)          — Percentage (0-100) or fixed IQD amount
  expiresAt        (Date)            — When coupon expires
  active           (Boolean)         — Whether coupon is active

Methods:
  applyDiscount(subtotal)            — Returns the discount amount in IQD
                                       Returns 0 if inactive or expired
                                       For percent: rounds to nearest integer
```

### adsModel.js

Advertisements/banners shown on the frontend.

```
Fields:
  title            (String, required) — Ad title
  adPicture        (String)           — Image URL on R2
  link             (String)           — Where the ad links to
  position         (String)           — Where to show the ad on the page
  active           (Boolean)          — Whether ad is active (default: true)
```

### homeModel.js

Homepage content configuration (single document).

```
Fields:
  mainSection:
    mainTitle      (String)           — Hero section title
    subTitle       (String)           — Hero section subtitle
    mainImage      (String)           — Hero background image URL

  mainCategories:  (Array)            — Featured categories on homepage
    title          (String)           — Category title
    description    (String)           — Category description

  about:
    storeDescription (String)         — About us text
    ourPartners    ([String])         — Partner names/logos
    aboutImage     (String)           — About section image URL

  footer:
    email          (String)           — Contact email
    phoneNumber    (String)           — Contact phone
    aboutDowera    (String)           — About the company text
    socialMediaLinks:
      facebookLink   (String)
      instagramLink  (String)
      twitterLink    (String)
```

### storeModel.js

Stores/merchants for product organization.

```
Fields:
  name             (String, required) — Store name
  logoImage        (String)           — Logo URL on R2
  description      (String)           — Store description

Virtuals:
  productIds       — References products belonging to this store
```

### tagsModel.js

Product tags for filtering and organization.

```
Fields:
  name             (String, unique)   — Tag name
  color            (String, required) — Display color (hex code)

Virtuals:
  productCount     — Count of products with this tag
```

### categoriesModel.js

Hierarchical product categories (base and subcategories).

```
Fields:
  name             (String, unique)   — Category name
  isFeatured       (Boolean)          — Show on homepage
  categoryType     (String, enum)     — "base" or "sub"
  baseCategory     (ObjectId, ref)    — Parent category (required if type is "sub")
```

### productsModel.js

General product catalog (non-Kinguin products, e.g., physical products).

```
Fields:
  name             (String)           — Product name
  isVisible        (Boolean)          — Show in catalog (default: true)
  originalPrice    (Number)           — Base price
  isBestseller     (Boolean)          — Bestseller badge
  isNew            (Boolean)          — New product badge
  category         (String)           — Category name
  image            (String, required) — Product image URL
  sizes            ([{price, size}])  — Size/variant options
  description      (String)           — Product description
  store            (ObjectId, ref)    — Belongs to which store
  productStock     (Number)           — Stock quantity
```

### reviewsModel.js

Product reviews with automatic rating aggregation.

```
Fields:
  userName         (String, required) — Reviewer name
  date             (String, required) — Review date
  rating           (Number, required) — Rating score
  product          (ObjectId, ref)    — Which product this reviews
  comment          (String)           — Review text

Post-save hook:   Recalculates average rating on the product
Post-delete hook: Recalculates average rating after deletion
```

### SyncState.js

Tracks sync configuration and state.

```
SyncProfile schema:
  name             (String, unique)   — Profile name (e.g., "default")
  filters          (Mixed)            — Filters sent to Kinguin API
  fields           ([String])         — Which fields to store

SyncState schema:
  key              (String, unique)   — State key (e.g., "lastSync")
  value            (Mixed)            — State value (e.g., ISO timestamp)
```

### PhysicalProduct.js & PhysicalOrder.js

Both files are **entirely commented out**. They were intended for physical product sales (non-digital) with seller/admin management but are not currently active.

### Article.js (post-models)

Sequelize model for **CMS articles** (storefront content, help pages, blog-style posts). Stored in PostgreSQL; table name `articles`.

```
Fields:
  id               (UUID, PK)        — Primary key
  slug             (String, unique)  — URL segment (unique; collisions get -2, -3, …)
  title            (String)          — Headline
  excerpt          (TEXT, optional)  — Short preview
  body             (TEXT)            — Full content (HTML or markdown as stored)
  status           (ENUM)            — "draft" or "published" (default: draft)
  publishedAt      (DATE, optional)  — Set when published (or on first publish)
  createdAt/updatedAt                 — Sequelize timestamps

Indexes:
  (status, publishedAt)              — Efficient public listing of published posts
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
  1. Reads referenceId from webhook body
  2. Finds order by waylReference
  3. Updates status to "wayle" (payment confirmed)
  4. Builds Kinguin order payload from cart items
  5. Places order on Kinguin API
  6. Saves kinguinOrderId, updates status to "kingwin"
  7. Returns success

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

Handles product listing, search, filtering, and price comparison with official stores.

```
normStr(s)
  Normalizes strings: lowercase, replaces hyphens/underscores with spaces, trims.

normalizePlatform(p)
  Converts platform names to canonical forms.
  Examples: "Steam" → "pc steam", "Uplay" → "pc ubisoft connect"

buildListQuery(qs)
  Builds a MongoDB query from URL query parameters.
  Supported filters:
    platform       — Filter by platform (normalized)
    regionId       — Filter by region
    releaseDate    — Filter by release date range
    publishers     — Filter by publisher name
    developers     — Filter by developer name
    genres         — Filter by genre (case-insensitive regex)
    tags           — Filter by ALL specified tags
    priceFrom/priceTo — Filter by IQD price range
    isAd           — Filter ad products
    metacriticScore — Filter by Metacritic rating range
    q              — Text search on name (case-insensitive)
  Always excludes hidden and out-of-stock products.

listProducts (GET /api/v1/products)
  1. Builds query from URL params using buildListQuery
  2. Applies sorting (priceMin, updatedAt, name) and pagination
  3. Fetches matching products from KinguinProduct collection
  4. Converts prices from IQD to user's currency (via IP detection)
  5. For each product, checks if ITAD price data needs refreshing (48h cache)
  6. Batches ITAD lookups for stale items
  7. Returns products with converted prices and official store comparison

getProduct (GET /api/v1/products/:kinguinId)
  1. Finds product by kinguinId
  2. Applies overrides (custom name, description, images)
  3. Converts price to user's currency
  4. Refreshes ITAD official store price if older than 48 hours
  5. Hides official store price if our price is cheaper
  6. Returns full product details

patchOverrides (PATCH /api/v1/products/:kinguinId/overrides)
  Admin endpoint to customize product display.
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
getHomeSection    — Returns the homepage configuration document
createHomeSection — Creates homepage config (only one allowed)
                    Handles mainImage and aboutImage uploads
updateHomeSection — Updates homepage config
                    Tracks old images for S3 deletion when replaced
```

### storeController.js

CRUD for stores/merchants.

```
createStore  — Creates store with optional logoImage upload
getStores    — Lists stores (admins see all fields, others exclude coupons)
getStore     — Gets single store by ID
updateStore  — Updates store, handles logo image replacement and S3 cleanup
deleteStore  — Deletes store and its associated S3 images
```

### adsController.js

CRUD for advertisements/banners.

```
createAd   — Creates ad using factory
getAds     — Lists all ads with filtering/sorting
getAd      — Gets single ad by ID
updateAd   — Updates ad, handles image replacement and S3 cleanup
deleteAd   — Deletes ad and its S3 image
```

### tagsController.js

CRUD for product tags.

```
getAllTags  — Lists tags using factory
getTag     — Gets single tag
createTag  — Creates tag
updateTag  — Updates tag
deleteTag  — Deletes tag (prevents deletion if products use it)
```

### userControllers.js

Admin-only user management using factory pattern.

```
createUserAdmin  — Creates user (admin)
getUsersAdmin    — Lists users with filtering/sorting
getUserAdmin     — Gets single user
updateUserAdmin  — Updates user
deleteUserAdmin  — Deletes user
```

### userDashboardController.js

User profile management (admin and self-service).

```
getMyProfileDetails — Gets own profile (admins can view any user)
deleteMe            — Self-deactivation (sets isActive: false)
adminDeleteUser     — Admin deactivates a user
getUsers            — Admin lists all users
```

### userProfileControllers.js

Self-service profile updates.

```
updateProfileData  — Updates name, governorate, city, address
updateProfileImage — Updates profile picture on R2 (deletes old image)
deleteUser         — Self-deactivation
```

### errorControllers.js

Global Express error handling middleware.

```
In development: Returns full error with stack trace
In production:  Returns user-friendly messages for known errors:
  - CastError      → "Invalid {field}: {value}" (400)
  - ValidationError → Field-specific messages (400)
  - Duplicate key   → "Duplicate field value" (400)
  - JWT error       → "Invalid token" (401)
  - Token expired   → "Token expired" (401)
  - Unknown errors  → "Something went wrong" (500)
```

### articleController.js

CMS articles: **public** handlers (published-only listing and by-slug) and **admin** CRUD (all statuses). Uses `catchAsyncErrors`, `AppError`, and helpers `slugify` / `resolveUniqueSlug` for unique slugs.

```
listPublished     — GET (public): paginated published articles (?page, ?limit; limit max 50)
getPublishedBySlug — GET (public): one published article by slug (404 if missing)
listAdmin         — GET (admin): all articles, newest updatedAt first
getById           — GET (admin): by UUID
create            — POST (admin): requires title + body; optional slug, excerpt, status, publishedAt
update            — PATCH (admin): partial fields; slug uniqueness on change; publishedAt rules on publish
delete            — DELETE (admin): 204 on success
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

### orderRoutes.js

**Base path:** `/api/v1/orders`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| POST | `/wayl-callback` | Public (Wayl) | `orderCtrl.waylCallback` | Payment webhook from Wayl |
| POST | `/checkout` | JWT | `orderCtrl.checkout` | Create order and get payment link |
| GET | `/my` | JWT | `orderCtrl.myOrders` | List my orders |
| GET | `/:id` | JWT | `orderCtrl.getOrder` | Get order with keys |

### productsRoutes.js

**Base path:** `/api/v1/products`

| Method | Path | Auth | Handler | Description |
|--------|------|------|---------|-------------|
| GET | `/` | Public | `productsControllers.listProducts` | List/search products |
| GET | `/search` | Public | `productsControllers.listProducts` | Temporary alias for legacy frontend search calls |
| GET | `/suggest` | Public | `productsControllers.suggestProducts` | Lightweight autocomplete suggestions for typeahead UX |
| GET | `/ads` | Public | `adsControllers.getAds` | List advertisements |
| GET | `/ads/:id` | Public | `adsControllers.getAd` | Get single ad |
| GET | `/:kinguinId` (numeric only) | Public | `productsControllers.getProduct` | Get product details |

Compatibility note: `/api/v1/products/search` (full listing alias) and `/api/v1/products/suggest` (autocomplete endpoint) are both kept during frontend migration. Keep `/search` for legacy clients and migrate typeahead flows to `/suggest`.

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
| GET | `/orders/:orderId` | Admin | `ordersControllers.getOrder` | Get order |
| PATCH | `/orders/:orderId` | Admin | `ordersControllers.updateOrder` | Update order |
| DELETE | `/orders/:orderId` | Admin | `ordersControllers.deleteOrder` | Delete order |
| GET | `/users` | Admin | User CRUD | List users |
| POST | `/users` | Admin | User CRUD | Create user |
| GET | `/users/:id` | Admin | User CRUD | Get user |
| PATCH | `/users/:id` | Admin | User CRUD | Update user |
| DELETE | `/users/:id` | Admin | User CRUD | Delete user |
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

### sellerRoutes.js

**Base path:** `/api/v1/seller`

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
  KINGUIN_BASE     — API base URL (https://gateway.kinguin.net/esa/api)
  KINGUIN_KEY      — API key from environment
  PAGE_SIZE        — Products per page (100, API maximum)
  CONCURRENCY      — Parallel page fetchers (default: 10)
  EUR_TO_IQD       — Exchange rate (default: 1535)
  IQD_MARKUP       — Fixed markup in IQD (default: 5800)

Strict filtering rules (lines 53-127):
  ALLOWED_REGION_IDS   — [3, 5, 19, 21, 24, 28, 30, 34, 40, 55, 56, 58, 80]
  ALLOWED_PLATFORMS    — PC Steam, PC Epic, Xbox, PlayStation, Nintendo, etc.
  ALLOWED_GENRES       — Action, Adventure, RPG, FPS, etc. (27 genres)
  BLACKLIST_GENRES     — Adult Games, Software, Subscription, etc.
  NAME_REQUIRE_RE      — Must contain "CD Key" (for non-card products)
  NAME_EXCLUDE_RE      — Must NOT contain "account"
  CARD_TITLE_WHITELIST — Exact titles for gift cards/subscriptions

Platform normalization (lines 128-263):
  Converts varied platform names to canonical forms.
  "Steam" → "PC Steam", "Uplay" → "PC Ubisoft Connect", etc.
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
     f. Price check (must exist, < €130)
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
  5. Products not in upstream → sets flags.hidden = true
  6. Products that reappear → sets flags.hidden = false

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
            SIGTERM/SIGINT → stops cron job, exits cleanly
```

---

## Utilities

### APIFeatures.js

Query builder class for MongoDB. Attaches to Mongoose queries.

```
filter()       — Converts URL params to MongoDB operators:
                 ?price[gte]=100 → { price: { $gte: 100 } }
                 Supports: gte, gt, lte, lt, in

sort()         — ?sort=price,-name → .sort("price -name")
                 Default: -createdAt (newest first)

selectFields() — ?fields=name,price → .select("name price")

paginate()     — Currently disabled (commented out)
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
  4. Gets IQD → target currency exchange rate (cached 1 hour)
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
deleteOne(Model)  — DELETE /:id → Deletes document, returns 204
updateOne(Model)  — PATCH /:id  → Updates document (blocks password changes)
createOne(Model)  — POST /      → Creates document, returns 201
getOne(Model)     — GET /:id    → Gets document with optional populate
getAll(Model)     — GET /       → Lists with filtering, sorting, pagination
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
lookupGameIdsByTitle(titles)  — Maps game titles to ITAD IDs
getPricesByGameIds(gameIds)   — Gets prices for multiple games
getOfficialDealForTitle(title) — Gets best deal from official stores:
  Returns: { shopName, url, priceAmount, regularAmount, cut, ... }
  Used to show "Available on Steam for $X" comparisons.
```

### platforms.js

Platform name normalization and ITAD shop ID mapping.

```
PLATFORM_SYNONYMS  — Map of platform variants → canonical names
normalizePlatform() — Converts platform string to canonical form
getShopIdsForPlatform() — Returns ITAD shop IDs for a platform
  Example: "PC Steam" → [61], "PC Epic Games" → [16]
```

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
validateCategoryExists — Checks req.body.category exists in Categories collection
validateTagsExist      — Checks all req.body.tags IDs exist in Tags collection
```

---

## Library

### kinguinClient.js

Preconfigured Axios client for the Kinguin ESA API.

```
client      — Axios instance with base URL and API key header pre-set
withRetry() — Retries failed requests (429, 5xx) with exponential backoff
              Up to 4 retries, 2s base delay, 15s max, random jitter
isoNowZ()   — Returns ISO timestamp without milliseconds: "2025-01-27T10:00:00Z"
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
MONGODB_URI              — MongoDB connection string
MONGODB_DB               — Database name

# PostgreSQL (Sequelize / post-models: catalog, CMS articles, orders)
POSTGRES_URI or DATABASE_URL — Connection URI (or POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD)
DB_INIT_ON_STARTUP       — When "true", runs sequelize.sync() on startup (creates tables such as `articles`, `kinguin_products`)
EXIT_ON_STARTUP_DB_FAILURE — Optional: exit process if DB schema is not ready

# Authentication
JWT_SECRET               — Secret for signing JWT tokens
JWT_EXPIRES_IN           — Token expiration (e.g., "90d")
JWT_COOKIE_EXPIRES_IN    — Cookie expiration in days
ADMIN_PASSWORD           — Password required for admin signup

# Kinguin API
KINGUIN_API_BASE         — Kinguin API base URL
KINGUIN_API_KEY          — Kinguin API key

# Wayl Payment Gateway
WAYL_AUTH_KEY            — Wayl authentication key
WAYL_BASE                — Wayl API base URL
WAYL_SECRET              — Wayl webhook secret
WAYL_r                   — Wayl webhook callback URL

# Twilio (OTP)
TWILIO_ACCOUNT_SID       — Twilio account SID
TWILIO_AUTH_TOKEN         — Twilio auth token
TWILIO_SERVICE_SID       — Twilio Verify service SID

# Cloudflare R2 (Image Storage)
R2_ACCESS_KEY_ID         — R2 access key
R2_SECRET_ACCESS_KEY     — R2 secret key
R2_BUCKET_NAME           — R2 bucket name
R2_ENDPOINT              — R2 endpoint URL
R2_BUCKET_PATH           — Base path in bucket
AWS_REGION               — Region (e.g., "auto")

# Cloudflare Analytics
CF_ZONE_ID               — Cloudflare zone ID
CF_API_TOKEN             — Cloudflare API token

# IsThereAnyDeal
ITAD_API_KEY             — ITAD API key
ITAD_DEFAULT_COUNTRY     — Default country for price lookup (e.g., "US")

# Sync Configuration
SYNC_PAGE_SIZE           — Products per page (default: 100)
SYNC_CONCURRENCY         — Parallel workers (default: 10)
SYNC_OVERLAP_MINUTES     — Overlap window for delta sync (default: 10)
SYNC_SCHEDULE            — Cron schedule for internal scheduler
ENABLE_INTERNAL_SCHEDULER — "true" to enable internal cron

# Pricing
EUR_TO_IQD               — EUR to IQD exchange rate (default: 1535)
IQD_MARKUP               — Fixed markup in IQD (default: 5800)

# Webhooks
WEBHOOK_SECRET           — Secret for Kinguin webhook verification
```

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
   b. Updates status to "wayle" (payment confirmed)
   c. Builds Kinguin order payload
   d. Calls Kinguin API to place order
   e. Saves kinguinOrderId, status → "kingwin"

8. KINGUIN processes the order and prepares keys

9. KINGUIN calls POST /webhooks/kinguin/order-complete
   Body: { orderId: "..." }

10. BACKEND (order-complete webhook):
    a. Finds order by kinguinOrderId
    b. Calls Kinguin API: GET /v2/order/{id}/keys
    c. Saves keys on the order
    d. Updates status → "completed"

11. USER opens their order page
    → Frontend calls GET /api/v1/orders/:id
    → Backend returns order with keys (CD keys visible)

12. BACKUP: If webhook was missed, getOrder lazily fetches keys
    from Kinguin when the user views the order.
```

---

## Sync Flow

How products are imported and kept up-to-date:

```
INITIAL SETUP (run once):
  POST /api/v1/sync/import  OR  node worker/importAll.js
  → Fetches ALL products from Kinguin (thousands of pages)
  → Filters by region, platform, genre, name, price
  → Converts EUR → IQD
  → Stores in KinguinProduct collection

ONGOING SYNC (every 2 minutes via Render cron):
  POST /api/v1/sync/run  OR  node worker/deltaSync.js
  → Reads lastSync timestamp from database
  → Fetches only products updated since lastSync - 10min overlap
  → Applies same filters
  → Updates existing products or inserts new ones
  → Saves new lastSync timestamp

DAILY RECONCILIATION (midnight UTC):
  POST /api/v1/sync/reconcile  OR  node worker/reconcile.js
  → Fetches ALL valid product IDs from Kinguin
  → Compares with local database
  → Hides products no longer in Kinguin (flags.hidden = true)
  → Unhides products that reappear

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
POST_DEPLOY_BASE_URL=https://your-deployment-url npm run validate:kinguin-startup
```
