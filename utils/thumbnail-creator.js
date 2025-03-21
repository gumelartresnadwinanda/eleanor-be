const fs = require("fs");
const path = require("path");
const {
  generateImageThumbnail,
  generateVideoThumbnail,
} = require("./thumbnail-generator");

async function processDirectory(directoryPath) {
  const results = {
    success: [],
    failed: [],
    skipped: [],
  };

  const files = fs.readdirSync(directoryPath);

  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    const ext = path.extname(file).toLowerCase();
    const thumbnailDir = path.join(directoryPath, "thumbnails");

    if (fs.lstatSync(filePath).isDirectory()) {
      if (file === "thumbnails") {
        console.log(`====================`);
        console.log(`Skipping thumbnails directory: ${filePath}`);
        continue;
      }
      console.log(`====================`);
      console.log(`Processing subdirectory: ${filePath}`);
      const subdirResults = await processDirectory(filePath);
      results.success.push(...subdirResults.success);
      results.failed.push(...subdirResults.failed);
      results.skipped.push(...subdirResults.skipped);
      continue;
    }

    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir);
    }

    const thumbnailPath = path.join(
      thumbnailDir,
      `thumb_${path.basename(filePath, ext)}.jpg`
    );

    if (fs.existsSync(thumbnailPath)) {
      console.log(`====================`);
      console.log(`Skipping existing thumbnail for file: ${filePath}`);
      results.skipped.push(file);
      continue;
    }

    try {
      console.log(`====================`);
      console.log(`Generating thumbnail for file: ${filePath}`);
      if (
        ext === ".jpg" ||
        ext === ".jpeg" ||
        ext === ".png" ||
        ext === ".webp"
      ) {
        await generateImageThumbnail(filePath, thumbnailPath);
        results.success.push(file);
      } else if (ext === ".mp4" || ext === ".avi" || ext === ".mkv") {
        await generateVideoThumbnail(filePath, thumbnailPath);
        results.success.push(file);
      } else {
        console.log(`Skipping unsupported file type: ${filePath}`);
        results.skipped.push(file);
      }
    } catch (error) {
      console.log(`====================`);
      console.error(
        `Failed to generate thumbnail for file: ${filePath}`,
        error
      );
      results.failed.push(file);
    }
  }

  return results;
}

module.exports = {
  processDirectory,
};
