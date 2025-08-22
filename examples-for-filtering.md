# Products API (Proxy to Kinguin) — Frontend Guide

This service is a **middleware proxy**. It does **not** store products. It forwards your query to Kinguin’s Products API and returns results.

Base path: `/api/v1/products`

---

## Endpoints

- `GET /api/v1/products` — list products with filters and pagination
- `GET /api/v1/products/:kinguinId` — fetch a single product by numeric `kinguinId`

---

## Query Parameters (whitelist)

| param            | type   | allowed values / format  | notes                   |
| ---------------- | ------ | ------------------------ | ----------------------- |
| `page`           | int    | 1..n                     | default `1`             |
| `limit`          | int    | 1..100                   | default `25`            |
| `name`           | string |                          | product name search     |
| `sortBy`         | string | `kinguinId`, `updatedAt` |                         |
| `sortType`       | string | `asc`, `desc`            |                         |
| `platform`       | string | comma list               | e.g. `Steam,Origin`     |
| `genre`          | string | comma list               | e.g. `Action,RPG`       |
| `kinguinId`      | string | comma list of numbers    | e.g. `1949,123456`      |
| `productId`      | string | comma list of strings    | v2 product ids if known |
| `languages`      | string | comma list               |                         |
| `isPreorder`     | string | `yes`, `no`              |                         |
| `activePreorder` | string | `yes`                    | only active preorders   |
| `regionId`       | int    | numeric                  |                         |
| `tags`           | string | comma list               |                         |
| `updatedSince`   | string | ISO datetime             | `YYYY-MM-DDTHH:mm:ssZ`  |
| `updatedTo`      | string | ISO datetime             | `YYYY-MM-DDTHH:mm:ssZ`  |
| `withText`       | string | `yes`                    | only text keys          |
| `merchantName`   | string |                          | seller name             |
| `priceFrom`\*    | number |                          | \*deprecated upstream   |
| `priceTo`\*      | number |                          | \*deprecated upstream   |

**Notes**

- Multiple values: pass as a **comma-separated string** (no spaces), e.g. `genre=Action,RPG`.
- Dates: use **ISO** strings (UTC recommended), e.g. `2025-08-01T00:00:00Z`.
- If a param is not in this table, it is ignored by the proxy.

---

## Response Shape

`GET /api/v1/products`:

```json
{
  "status": "success",
  "meta": {
    "page": 1,
    "limit": 25,
    "item_count": 1234
  },
  "results": [
    {
      "kinguinId": 1949,
      "productId": "5c9b68662539a4e8f17ae2fe",
      "name": "Counter-Strike: Source",
      "platform": "Steam",
      "price": 5.79,
      "updatedAt": "2025-08-20T08:40:44+00:00",
      "...": "other fields from Kinguin"
    }
  ]
}
GET /api/v1/products/:kinguinId:

json
Copy
Edit
{
  "status": "success",
  "data": {
    "kinguinId": 1949,
    "productId": "5c9b68662539a4e8f17ae2fe",
    "name": "Counter-Strike: Source",
    "...": "full product object from Kinguin"
  }
}
Examples
1) Basic search by name
bash
Copy
Edit
GET /api/v1/products?name=forza
2) Pagination and sorting
bash
Copy
Edit
GET /api/v1/products?page=2&limit=50&sortBy=updatedAt&sortType=desc
3) Filter by platform and genre
bash
Copy
Edit
GET /api/v1/products?platform=Steam&genre=Action,RPG
4) Only products with text keys
bash
Copy
Edit
GET /api/v1/products?withText=yes
5) Active preorders
bash
Copy
Edit
GET /api/v1/products?activePreorder=yes
6) Updated in a date window
bash
Copy
Edit
GET /api/v1/products?updatedSince=2025-08-01T00:00:00Z&updatedTo=2025-08-22T23:59:59Z
7) Exact IDs
bash
Copy
Edit
GET /api/v1/products?kinguinId=1949,123456
GET /api/v1/products?productId=5c9b68662539a4e8f17ae2fe,abc123
8) Single product
bash
Copy
Edit
GET /api/v1/products/1949
Fetch Usage
ts
Copy
Edit
// List with filters
const params = new URLSearchParams({
  name: "elden ring",
  platform: "Steam",
  sortBy: "updatedAt",
  sortType: "desc",
  page: "1",
  limit: "24"
});

const res = await fetch(`/api/v1/products?${params.toString()}`);
const data = await res.json();
// data.results is the array
ts
Copy
Edit
// Single product
const res = await fetch(`/api/v1/products/1949`);
const data = await res.json();
// data.data is the product
Error Cases
400 — bad query (e.g., non-numeric kinguinId in the /:kinguinId route)

404 — product not found (common if a product is out of stock and upstream returns 404)

500 — missing server config or upstream error

The proxy passes Kinguin errors through with a simplified shape:

json
Copy
Edit
{ "status": "fail", "message": "upstream error message" }
Frontend Tips
Treat results as read-only Kinguin data.

For multi-select filters, join values with commas: tags=Survival,Open-World.

Use meta.item_count for your pagination controls.

Debounce name searches to reduce calls.

Prefer updatedAt sorting for “new arrivals”.

Copy
Edit
```
