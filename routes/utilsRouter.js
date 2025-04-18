const express = require("express");
const { scanDirectories } = require("../utils/directory-scanner");
const { processDirectory } = require("../utils/thumbnail-creator");
const { updateCreatedDate } = require("../utils/update-created-date");
const {
  findMissingThumbnails,
  findThumbnailsWithoutFile,
} = require("../utils/thumbnail-finder");
const {
  connectToRedis,
  isRedisAvailable,
  clearCache,
} = require("../config/redis");

const router = express.Router();

router.get("/scan-dir", async (req, res) => {
  const { directoryPath } = req.query;
  if (!directoryPath || typeof directoryPath !== "string") {
    return res.status(400).json({
      error: "directoryPath query parameter is required and must be a string",
    });
  }

  console.log(`Scanning directory: ${directoryPath}`);

  try {
    const directories = await scanDirectories(directoryPath);
    const generated = directories.filter((dir) => !dir.includes("thumbnails"));

    res.status(200).json({
      message: "Directories scanned successfully",
      dir: generated,
    });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Failed to scan directories", message: error.message });
  }
});

router.post("/generate-thumbnails", async (req, res) => {
  const { directoryPath } = req.query;
  if (!directoryPath || typeof directoryPath !== "string") {
    return res.status(400).json({
      error: "directoryPath body parameter is required and must be a string",
    });
  }

  console.log(`====================`);
  console.log(`Generating thumbnails for directory: ${directoryPath}`);

  try {
    const results = await processDirectory(directoryPath);
    console.log(`====================`);
    console.log(`Thumbnail generation results:`, results);
    res.status(200).json({
      message: "Thumbnail generation completed",
      results,
    });
  } catch (error) {
    console.log(`====================`);
    console.error(
      `Failed to generate thumbnails for directory: ${directoryPath}`,
      error
    );
    res.status(500).json({
      error: "Failed to generate thumbnails",
      message: error.message,
    });
  }
});

router.post("/update-created-date", async (req, res) => {
  const { directoryPath, recursiveCheck } = req.query;
  if (!directoryPath || typeof directoryPath !== "string") {
    return res.status(400).json({
      error: "directoryPath query parameter is required and must be a string",
    });
  }

  console.log(`Updating created dates for directory: ${directoryPath}`);

  try {
    const results = await updateCreatedDate(
      directoryPath,
      recursiveCheck === "true"
    );
    res.status(200).json({
      message: "Created dates updated successfully",
      updatedCount: results.updatedFiles.length,
      updatedFiles: results.updatedFiles,
      skippedCount: results.skippedFiles.length,
      skippedFiles: results.skippedFiles,
      errorCount: results.errorFiles.length,
      errorFiles: results.errorFiles,
    });
  } catch (error) {
    console.error(
      `Failed to update created dates for directory: ${directoryPath}`,
      error
    );
    res.status(500).json({
      error: "Failed to update created dates",
      message: error.message,
    });
  }
});

router.post("/find-thumbnails", async (req, res) => {
  const { directoryPath } = req.query;
  if (!directoryPath || typeof directoryPath !== "string") {
    return res.status(400).json({
      error: "directoryPath query parameter is required and must be a string",
    });
  }

  console.log(`Finding missing thumbnails in directory: ${directoryPath}`);

  try {
    const missingThumbnails = await findMissingThumbnails(directoryPath);
    res.status(200).json({
      message: "Thumbnail finding completed",
      missingThumbnails,
    });
  } catch (error) {
    console.error(
      `Failed to find thumbnails for directory: ${directoryPath}`,
      error
    );
    res.status(500).json({
      error: "Failed to find thumbnails",
      message: error.message,
    });
  }
});

router.post("/find-orphan-thumbnails", async (req, res) => {
  const { directoryPath } = req.query;
  if (!directoryPath || typeof directoryPath !== "string") {
    return res.status(400).json({
      error: "directoryPath query parameter is required and must be a string",
    });
  }

  console.log(`Finding orphan thumbnails in directory: ${directoryPath}`);

  try {
    const orphanThumbnails = await findThumbnailsWithoutFile(directoryPath);
    res.status(200).json({
      message: "Orphan thumbnail finding completed",
      orphanThumbnails,
    });
  } catch (error) {
    console.error(
      `Failed to find orphan thumbnails for directory: ${directoryPath}`,
      error
    );
    res.status(500).json({
      error: "Failed to find orphan thumbnails",
      message: error.message,
    });
  }
});

router.get("/reconnect-redis", async (req, res) => {
  if (isRedisAvailable) {
    return res.json({ message: "Redis is already connected." });
  }

  try {
    await connectToRedis();
    res.json({ message: `successfully retried` });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Redis reconnect failed", error: err.message });
  }
});

router.delete("/clear-cache", async (req, res) => {
  try {
    await clearCache();
    res.json({ message: "🧹 All Redis cache cleared." });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to clear cache", details: error.message });
  }
});
module.exports = router;
