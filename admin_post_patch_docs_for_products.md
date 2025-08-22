# 📦 API Documentation – Products & Stores (POST & PATCH via Axios)

This doc explains how to use `multipart/form-data` to interact with your backend APIs using **Axios**, based on your actual controller logic.

---

## 🏬 Create Store

```js
import axios from "axios";

const createStore = async () => {
  const formData = new FormData();

  const json = {
    name: "Test Store",
    handle: "test-store",
    description: "Selling cool stuff",
  };

  formData.append("json", JSON.stringify(json));
  formData.append("logoImage", selectedLogoFile); // File object from input

  try {
    const res = await axios.post("/api/v1/dashboard/store", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    console.log("Store created:", res.data);
  } catch (err) {
    console.error("Error creating store:", err.response?.data || err);
  }
};
```
