const mongoose = require("mongoose");

const homeSchema = new mongoose.Schema(
  {
    mainSection: {
      mainTitle: String,
      subTitle: String,
      mainImage: String,
    },
    mainCategories: [{ title: String, description: String }],
    about: {
      storeDescription: String,
      ourPartners: [String],
      aboutImage: String,
    },
    footer: {
      email: {
        type: String,
      },
      phoneNumber: String,
      aboutDowera: String,
      socialMediaLinks: {
        facebookLink: String,
        instagramLink: String,
        twitterLink: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

const homeModel = mongoose.model("Home", homeSchema);

module.exports = homeModel;
