# Dashbord README

This file lists all routes mounted under the dashboard API.

Base route: `/api/v1/dashboard`

## Public Routes

- `POST /api/v1/dashboard/signup` - Create admin account.
- `POST /api/v1/dashboard/login` - Admin login.
- `GET /api/v1/dashboard/get-top-selling-games` - Get top selling games.

## Protected Admin Routes

These routes require authentication and admin permission.

### Articles
- `GET /api/v1/dashboard/articles` - List articles (admin).
- `POST /api/v1/dashboard/articles` - Create article.
- `GET /api/v1/dashboard/articles/:id` - Get article by id.
- `PATCH /api/v1/dashboard/articles/:id` - Update article.
- `DELETE /api/v1/dashboard/articles/:id` - Delete article.

### Dashboard Stats
- `GET /api/v1/dashboard/stats` - Get dashboard stats.

### Ads
- `GET /api/v1/dashboard/ads` - List ads.
- `POST /api/v1/dashboard/ads` - Create ad.
- `GET /api/v1/dashboard/ads/:adId` - Get ad by id.
- `PATCH /api/v1/dashboard/ads/:adId` - Update ad.
- `DELETE /api/v1/dashboard/ads/:adId` - Delete ad.

### Products
- `GET /api/v1/dashboard/products` - List products for dashboard.
- `GET /api/v1/dashboard/products/:kinguinId` - Get product details.
- `PATCH /api/v1/dashboard/products/:kinguinId/overrides` - Update product overrides.

### Orders
- `GET /api/v1/dashboard/orders` - List orders.
- `GET /api/v1/dashboard/orders/:orderId` - Get order details.
- `PATCH /api/v1/dashboard/orders/:orderId` - Update order.
- `DELETE /api/v1/dashboard/orders/:orderId` - Delete order.

### Users
- `GET /api/v1/dashboard/users` - List users (admin panel).
- `POST /api/v1/dashboard/users` - Create user (admin panel).
- `GET /api/v1/dashboard/users/:id` - Get user by id.
- `PATCH /api/v1/dashboard/users/:id` - Update user.
- `DELETE /api/v1/dashboard/users/:id` - Delete user.

## Games Genre Endpoint

There is no dedicated dashboard endpoint in `routes/dashboardRoutes.js` that explicitly returns only game genres.
