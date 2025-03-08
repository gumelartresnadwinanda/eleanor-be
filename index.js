const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const authMiddleware = require("./middleware/authMiddleware");
const cors = require("cors");

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

const playlistRoutes = require("./routes/playlistRoutes");
app.use("/playlists", playlistRoutes);

const PORT = process.env.PORT || 5435;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
