const express = require("express");
const cookieParser = require("cookie-parser");
const authMiddleware = require("./middleware/authMiddleware");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(authMiddleware);

app.get("/", (req, res) => {
  res.send("Media Server is running!");
});

const mediaRoutes = require("./routes/mediaRoutes");
app.use("/medias", mediaRoutes);

const PORT = process.env.PORT || 5435;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
