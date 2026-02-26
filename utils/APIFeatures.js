class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = { ...(queryString || {}) };
  }

  filter() {
    const queryObj = structuredClone(this.queryString);
    const excludeFields = ["page", "sort", "limit", "fields"];
    excludeFields.forEach((el) => delete queryObj[el]);

    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(
      /\b(gte|gt|lte|lt|in)\b/g,
      (match) => `$${match}`
    );

    this.query.find(JSON.parse(queryStr));

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      this.query = this.query.sort(this.queryString.sort.split(",").join(" "));
    } else {
      this.query = this.query.sort("-createdAt");
    }

    return this;
  }

  paginate() {
    // const limitNum = this.queryString.limit * 1;
    // const pageNum = this.queryString.page * 1;

    // if (
    //   typeof limitNum !== "number" ||
    //   isNaN(limitNum) ||
    //   typeof pageNum !== "number" ||
    //   isNaN(pageNum)
    // ) {
    //   return this;
    // }

    // const page = pageNum || 1;
    // let limit = limitNum || 5; // Default limit
    // // if (limit >= 14) limit = 14; // Apply max limit
    // const skip = (page - 1) * limit;

    // this.query = this.query.skip(skip).limit(limit);
    return this;
  }

  selectFields() {
    if (this.queryString.fields) {
      this.query = this.query.select(
        this.queryString.fields.split(",").join(" ")
      );
    } else {
      this.query = this.query.select("-__v");
    }
    return this;
  }
}

module.exports = APIFeatures;
