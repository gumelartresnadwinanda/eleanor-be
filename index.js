const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const authMiddleware = require("./middleware/authMiddleware");
const { DEFAULT_PORT, DEFAULT_SERVER } = require("./constants/default");

const allowedOrigins = process.env.CORS_ORIGINS?.split(",") || [];

const app = express();
app.use(bodyParser.json()); // Parse incoming JSON data

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(authMiddleware);

app.get("/", (req, res) => {
  res.send("Media Server is running!");
});

const mediaRoutes = require("./routes/mediaRoutes");
app.use("/medias", mediaRoutes);

const tagsRoutes = require("./routes/tagsRoutes");
app.use("/tags", tagsRoutes);

const utilsRouter = require("./routes/utilsRouter");
app.use("/utils", utilsRouter);

app.get("/file/*", (req, res) => {
  const requestedPath = req.params[0];
  const fullPath = path.resolve(requestedPath);

  if (fs.existsSync(fullPath)) {
    res.sendFile(fullPath);
  } else {
    res.status(404).send("File not found");
  }
});

const SERVER_PORT = process.env.SERVER_PORT || DEFAULT_PORT;
const SERVER_URL = process.env.SERVER_URL || DEFAULT_SERVER;

app.listen(SERVER_PORT, () => {
  console.log(`Server is running on ${SERVER_URL}:${SERVER_PORT}`);
});
