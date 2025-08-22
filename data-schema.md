# API Schema Documentation

## Users

### Fields

| Field               | Type   | Required | Description                                             |
| ------------------- | ------ | -------- | ------------------------------------------------------- |
| `email`             | String | Yes      | User's email address (must be valid and unique)         |
| `role`              | String | No       | Role of the user (`user` or `admin`), default is `user` |
| `password`          | String | Yes      | Password (min length: 8, not returned in responses)     |
| `passwordChangedAt` | Date   | No       | Timestamp of last password change                       |

---

## Store

### Fields

| Field         | Type   | Required | Description                 |
| ------------- | ------ | -------- | --------------------------- |
| `name`        | String | Yes      | Name of the store           |
| `logoImage`   | String | No       | URL of the store logo image |
| `description` | String | No       | Description of the store    |

---

## Products

### Fields

| Field           | Type     | Required | Description                      |
| --------------- | -------- | -------- | -------------------------------- |
| `name`          | String   | No       | Product name                     |
| `isVisible`     | Boolean  | No       | Visibility flag (default `true`) |
| `price`         | Number   | No       | Discounted/current price         |
| `originalPrice` | Number   | No       | Original price before discount   |
| `isBestseller`  | Boolean  | No       | Bestseller flag                  |
| `isNew`         | Boolean  | No       | New product flag                 |
| `category`      | String   | No       | Product category                 |
| `image`         | String   | Yes      | URL to product image             |
| `description`   | String   | No       | Product description              |
| `size`          | String   | No       | Size information                 |
| `expireDate`    | String   | No       | Expiration date                  |
| `usage`         | String   | No       | How to use                       |
| `skinType`      | String   | No       | Skin types suitable for product  |
| `origin`        | String   | No       | Country of origin                |
| `content`       | String   | No       | Product content/ingredients      |
| `store`         | ObjectId | No       | Linked Store ID                  |
| `productStock`  | Number   | No       | Available stock quantity         |

---

## Orders

### Fields

| Field         | Type             | Required | Description                                                           |
| ------------- | ---------------- | -------- | --------------------------------------------------------------------- |
| `firstName`   | String           | No       | Customer first name                                                   |
| `city`        | String           | No       | City name                                                             |
| `governorate` | String           | No       | Iraqi governorate (validated enum)                                    |
| `address`     | String           | No       | Full delivery address                                                 |
| `phoneNumber` | String           | No       | Customer's phone number                                               |
| `ReceivedOn`  | String           | No       | Requested delivery date                                               |
| `status`      | String           | No       | Order status: `pending`, `delivered`, `canceled` (default: `pending`) |
| `totalPrice`  | String           | No       | Total price for the order                                             |
| `totalItems`  | String           | No       | Total number of items in the order                                    |
| `notes`       | String           | No       | Optional order notes                                                  |
| `items`       | Array of objects | No       | List of products in the order                                         |

#### Items fields in the order

| Subfield   | Type   | Description          |
| ---------- | ------ | -------------------- |
| `name`     | String | Product name         |
| `brand`    | String | Product brand        |
| `quantity` | Number | Number of units      |
| `price`    | String | Price per unit       |
| `total`    | String | Total price for item |

---
