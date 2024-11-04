import mongoose from "mongoose";
import "./env.config";


// Defining MongoDB connection URI: (For Localhost)
let MONGO_URI = `mongodb://${process.env.MONGO_HOSTNAME}/${process.env.MONGO_DB}`;
console.log("MONGO URL CONNECTION :", MONGO_URI);

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Successfully connected to MongoDB !!");
  })
  .catch((err) => {
    console.error("Error while establishing connection with MongoDB:", err);
  });
