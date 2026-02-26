class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
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
      this.query = this.query.sort("-date");
    }

    return this;
  }

  paginaaton() {
    if (
      !(typeof (this.queryString.limit * 1) == "number") ||
      !(typeof (this.queryString.page * 1) == "number")
    ) {
      return this;
    }

    const page = this.queryString.page * 1 || 1;
    let limit = this.queryString.limit * 1 || 5;
    // limit = limit >= 14 ? 14 : limit
    if (limit >= 14) limit = 14;
    const skip = (page - 1) * limit; //page=3 --> skip = (3-1) * 5 = 10 (skip the first 10 results)

    this.query = this.query.skip(skip).limit(limit);
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
