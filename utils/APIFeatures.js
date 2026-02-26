const { Op } = require("sequelize");

class APIFeatures {
  constructor(model, queryString, baseWhere = {}) {
    this.model = model;
    this.queryString = { ...(queryString || {}) };
    this.options = { where: { ...(baseWhere || {}) } };
  }

  filter() {
    const queryObj = structuredClone(this.queryString);
    const excludeFields = ["page", "sort", "limit", "fields"];
    excludeFields.forEach((el) => delete queryObj[el]);

    Object.entries(queryObj).forEach(([field, value]) => {
      if (value === undefined || value === null || value === "") return;

      if (typeof value === "object" && !Array.isArray(value)) {
        const operators = {};
        if (value.gte !== undefined) operators[Op.gte] = value.gte;
        if (value.gt !== undefined) operators[Op.gt] = value.gt;
        if (value.lte !== undefined) operators[Op.lte] = value.lte;
        if (value.lt !== undefined) operators[Op.lt] = value.lt;
        if (value.in !== undefined) {
          operators[Op.in] = Array.isArray(value.in)
            ? value.in
            : String(value.in)
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
        }
        this.options.where[field] = operators;
        return;
      }

      this.options.where[field] = value;
    });

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      this.options.order = this.queryString.sort.split(",").map((field) => {
        const cleanField = field.trim();
        if (cleanField.startsWith("-")) {
          return [cleanField.slice(1), "DESC"];
        }
        return [cleanField, "ASC"];
      });
    } else {
      this.options.order = [["createdAt", "DESC"]];
    }

    return this;
  }

  paginate() {
    const page = Math.max(1, Number(this.queryString.page) || 1);
    const limit = Math.max(1, Number(this.queryString.limit) || 100);
    this.options.limit = limit;
    this.options.offset = (page - 1) * limit;
    return this;
  }

  selectFields(defaultExcluded = []) {
    if (this.queryString.fields) {
      this.options.attributes = this.queryString.fields
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
    } else if (defaultExcluded.length) {
      this.options.attributes = { exclude: defaultExcluded };
    }
    return this;
  }

  async count() {
    return this.model.count({ where: this.options.where });
  }

  async execute() {
    return this.model.findAll(this.options);
  }
}

module.exports = APIFeatures;
