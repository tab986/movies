# API Filtering, Sorting, Pagination, and Field Selection

This document explains how to use query parameters for filtering, sorting, paginating, and selecting fields when calling the API endpoints. and its general asf

## 🧪 Filtering

You can filter data by providing query parameters such as `category`, `tags`, and any other supported fields.

### Filter by Category id or name

```http
GET /api/v1/dashboard/products?category=60d21b4667d0d8992e610c85
```

### Filter by Tags (comma-separated tag IDs)

```http
GET /api/v1/dashboard/products?tags=684e57c3d87982e4d84c363c,684e57c3d87982e4d84c363c
```

This will return all products that have at least one of the specified tag IDs.

## 🔃 Advanced Filtering (Operators)

You can also filter using operators such as:

- `gte`: Greater than or equal
- `gt`: Greater than
- `lte`: Less than or equal
- `lt`: Less than
- `in`: Matches values in a list

### Example

```http
GET /api/v1/dashboard/products?price[gte]=100&price[lte]=500
```

This filters products with a price between 100 and 500.

---

## 🔀 Sorting

You can sort by one or more fields using the `sort` parameter.

### Sort by Rating (Descending)

```http
GET /api/v1/dashboard/products?sort=-rateAvg
```

### Sort by Name (Ascending) and Rating (Descending)

```http
GET /api/v1/dashboard/products?sort=name,-rateAvg
```

Use a minus sign (`-`) for descending order.

---

## 📄 Pagination

Use `page` and `limit` parameters to paginate results.

### Get Page 2 with 10 Products per Page

```http
GET /api/v1/dashboard/products?page=2&limit=10
```

- Default limit: 5
- Maximum limit: 14

---

## 📦 Field Selection

Use the `fields` parameter to return only selected fields.

### Example: Return Only `name` and `price`

```http
GET /api/v1/dashboard/products?fields=name,price
```

By default, the `__v` field is excluded from responses unless explicitly requested.

---

## ✅ Combined Example

```http
GET /api/v1/dashboard/products?tags=684e57c3d87982e4d84c363c&sort=-rateAvg&limit=10&page=1&fields=name,price
```

This example:

- Filters by tags
- Sorts by `rateAvg` descending
- Limits to 10 results
- Returns page 1
- Selects only `name` and `price` fields
