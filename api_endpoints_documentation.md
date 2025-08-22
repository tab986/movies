# Dashboard API Endpoints

This document outlines the available dashboard API endpoints for managing Orders, Products, and Stores.

## Base URL /api/v1/dashboard

---

## Orders

### `GET /orders`

Retrieve a list of all orders.

### `POST /orders`

Create a new order.

### `GET /orders/:orderId`

Retrieve a specific order by its ID.

### `PATCH /orders/:orderId`

Update a specific order by its ID.

### `DELETE /orders/:orderId`

Delete a specific order by its ID.

---

## Products

### `GET /products`

Retrieve a list of all products.

### `POST /products`

Create a new product. Requires image upload and processing middleware.

### `GET /products/:productId`

Retrieve a specific product by its ID.

### `PATCH /products/:productId`

Update a product. Requires image upload and processing middleware.

### `DELETE /products/:productId`

Delete a product by its ID.

---

## Stores

### `GET /store`

Retrieve a list of all stores.

### `POST /store`

Create a new store. Requires image upload and processing middleware.

### `GET /store/:storeId`

Retrieve a specific store by its ID.

### `PATCH /store/:storeId`

Update a specific store. Requires image upload and processing middleware.

### `DELETE /store/:storeId`

Delete a specific store by its ID.

---
