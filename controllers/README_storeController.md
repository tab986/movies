# Store Controller - Line by Line Explanation

## Overview
This file contains all the controller functions for managing stores in the application. Controllers handle the business logic for HTTP requests and send responses back to the client.

---

## 1. Imports and Dependencies

```javascript
const Store = require("../models/storeModel");
```
- Imports the Store model from the models folder
- The Store model defines the structure and methods for store documents in MongoDB

```javascript
const catchAsyncErrors = require("../utils/catchAsyncErrors");
```
- Imports a utility function that wraps async functions to catch any errors
- Prevents having to write try-catch blocks in every controller function

```javascript
const APIFeatures = require("../utils/APIFeatures");
```
- Imports a utility class for building database queries
- Provides methods for filtering, sorting, pagination, and selecting specific fields

```javascript
const deleteFiles = require("../utils/deletefiles");
```
- Imports a utility function to delete files from the server
- Currently not used in active code (mostly commented out)

```javascript
const { deleteS3ObjectFromUrl } = require("../utils/s3Utils");
```
- Imports a function to delete files from AWS S3 storage
- Used when deleting or updating store images

```javascript
const appError = require("../utils/appError");
```
- Imports a custom error class for throwing application errors
- Allows for consistent error messages and HTTP status codes

---

## 2. Commented Out Code Section

Lines 9-72 contain commented out code for image uploading and processing using:
- **multer**: A middleware for handling file uploads
- **sharp**: A library for image resizing and optimization

This functionality has been replaced with direct JSON-based image handling in the current code.

---

## 3. Create Store Function

```javascript
exports.createStore = catchAsyncErrors(async (req, res, next) => {
```
- **exports.createStore**: Makes this function available to routes
- **catchAsyncErrors**: Wraps the function to catch and handle errors
- **async**: Function is asynchronous (uses await)
- **req, res, next**: Express parameters
  - `req`: Request object containing client data
  - `res`: Response object to send data back to client
  - `next`: Middleware function to pass control to next middleware

```javascript
  if (!req.body.json) {
    return next(new appError("please insert json key with form-data", 400));
  }
```
- Checks if the request body contains a 'json' field
- If missing, creates a 400 (Bad Request) error and passes it to error handler
- The error handler will send the error to the client

```javascript
  let json;
  try {
    json = JSON.parse(req.body.json);
  } catch (err) {
    return next(new appError("Invalid JSON format in form-data", 400));
  }
```
- Attempts to parse the JSON string from the request
- If parsing fails, sends a 400 error
- This prevents the app from crashing on invalid JSON

```javascript
  if (req.body.logoImage) {
    json.logoImage = req.body.logoImage;
  }
```
- Checks if a logo image was provided in the request
- If yes, adds it to the parsed JSON data

```javascript
  const newStore = await Store.create(json);
```
- Creates a new store document in MongoDB with the provided data
- **await**: Waits for the database operation to complete
- Stores the result in `newStore` variable

```javascript
  res.status(201).json({
    status: "success",
    data: { store: newStore },
  });
```
- Sends a response with HTTP status 201 (Created)
- Returns the newly created store data as JSON

---

## 4. Get Stores Function (List All Stores)

```javascript
exports.getStores = catchAsyncErrors(async (req, res) => {
  let stores;
  const features = new APIFeatures(Store.find(), req.query)
    .filter()
    .sort()
    .paginate()
    .selectFields();
```
- Creates a new APIFeatures instance with a MongoDB query
- **Store.find()**: Returns all stores from database
- **req.query**: Contains URL query parameters (like ?page=1&limit=10)
- Chains method calls to apply filtering, sorting, pagination, and field selection

```javascript
  if (req.user?.role == "admin") {
    stores = await features.query;
  } else {
    stores = await features.query.select("-activeCoupons");
  }
```
- **req.user?.role**: Uses optional chaining to safely check user role
- If user is admin: Returns all store data including activeCoupons
- If user is not admin: Excludes activeCoupons field (the minus sign means exclude)

```javascript
  res.status(200).json({
    status: "success",
    results: stores.length,
    data: { stores },
  });
```
- Sends a 200 (OK) response
- Includes the number of stores returned and the store data

---

## 5. Get Single Store Function

```javascript
exports.getStore = catchAsyncErrors(async (req, res, next) => {
  let store;
  if (req.user?.role == "admin") {
    store = await Store.findById(req.params.storeId);
  } else {
    store = await Store.findById(req.params.storeId);
  }
```
- **req.params.storeId**: Gets the store ID from the URL (e.g., /stores/123)
- Currently, both admin and non-admin paths do the same thing (not differentiated)
- Finds a single store by its MongoDB ID

```javascript
  if (!store) return next(new appError("Store not found", 404));
```
- If store doesn't exist, sends a 404 (Not Found) error

```javascript
  res.status(200).json({ status: "success", data: { store } });
```
- Sends the store data as JSON

---

## 6. Update Store Function

```javascript
exports.updateStore = catchAsyncErrors(async (req, res, next) => {
  let json = {};
  if (req.body.json) {
    try {
      json = JSON.parse(req.body.json);
    } catch (err) {
      return next(new appError("Invalid JSON format in form-data", 400));
    }
  }
```
- Initializes an empty object to hold update data
- Parses JSON from request body if it exists
- Uses try-catch to handle invalid JSON

```javascript
  const store = await Store.findById(req.params.storeId);
  if (!store) {
    return next(new appError("store not found", 404));
  }
```
- Fetches the existing store from database
- Returns 404 error if store doesn't exist

```javascript
  const imagesToDelete = [];

  if (req.body.logoImage && req.body.logoImage !== store.logoImage) {
    if (store.logoImage) imagesToDelete.push(store.logoImage);
    json.logoImage = req.body.logoImage;
  }
```
- Creates an array to track which images need to be deleted from S3
- If a new logo image is provided AND it's different from the existing one:
  - Adds the old logo to the deletion list
  - Sets the new logo in the update data

```javascript
  const updatedStore = await Store.findOneAndUpdate(
    { _id: req.params.storeId },
    json,
    { new: true, runValidators: true }
  );
```
- **findOneAndUpdate**: Updates the store in database
- **{ _id: req.params.storeId }**: Finds the store by ID
- **json**: The data to update
- **{ new: true }**: Returns the updated document (not the old one)
- **{ runValidators: true }**: Validates data against schema before updating

```javascript
  if (!updatedStore) {
    return next(new appError("store not found after update", 404));
  }
```
- Safety check in case the update fails

```javascript
  await Promise.all(imagesToDelete.filter(Boolean).map(deleteS3ObjectFromUrl));
```
- **filter(Boolean)**: Removes any empty/null values from the array
- **map(deleteS3ObjectFromUrl)**: Creates a promise for each image deletion
- **Promise.all()**: Waits for all deletions to complete
- Deletes old images from S3 storage

```javascript
  res.status(200).json({
    status: "success",
    data: updatedStore,
  });
```
- Sends the updated store data back to client

---

## 7. Delete Store Function

```javascript
exports.deleteStore = catchAsyncErrors(async (req, res, next) => {
  const store = await Store.findByIdAndDelete(req.params.storeId);

  if (!store) {
    return next(new appError("Store not found", 404));
  }
```
- **findByIdAndDelete**: Removes the store from database and returns it
- If store doesn't exist, sends 404 error

```javascript
  const imagesToDelete = [];

  if (store.logoImage) {
    imagesToDelete.push(store.logoImage);
  }
```
- Collects any images associated with the store
- Currently only handles logo image (could be extended for other images)

```javascript
  await Promise.all(imagesToDelete.map(deleteS3ObjectFromUrl));
```
- Deletes all collected images from S3 storage
- Uses Promise.all() to delete all images in parallel

```javascript
  res.status(204).json({
    status: "success",
    message: "Store deleted",
  });
```
- Sends a 204 (No Content) response
- Indicates successful deletion

---

## Summary of Functions

| Function | Method | Purpose |
|----------|--------|---------|
| createStore | POST | Creates a new store |
| getStores | GET | Retrieves all stores with filtering/pagination |
| getStore | GET | Retrieves a single store by ID |
| updateStore | PUT | Updates store data and handles image replacement |
| deleteStore | DELETE | Removes a store and its images |

---

## Key Concepts Used

- **Async/Await**: Handles asynchronous database operations
- **Error Handling**: Uses custom error class with consistent status codes
- **Database Queries**: Uses MongoDB find, create, update, delete operations
- **File Management**: Deletes images from S3 when stores are updated or deleted
- **Role-Based Access**: Different responses based on admin status
- **Validation**: Parses and validates JSON input before using it
