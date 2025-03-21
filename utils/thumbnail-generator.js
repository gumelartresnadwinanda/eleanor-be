const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");

async function generateImageThumbnail(imagePath, thumbnailPath) {
  try {
    const stats = fs.statSync(imagePath);
    const fileSizeInKB = stats.size / 1024;

    await sharp(imagePath)
      .resize(200, 200, { fit: "inside" })
      .toFile(thumbnailPath);
    console.log(`Thumbnail generated for image: ${imagePath}`);

    if (fileSizeInKB >= 400) {
      // Generate medium thumbnail
      await sharp(imagePath)
        .resize(400, 400, { fit: "inside" })
        .toFile(thumbnailPath.replace(".jpg", "_md.jpg"));
      console.log(`Medium thumbnail generated for image: ${imagePath}`);
    } else {
      console.log(
        `Skipping medium thumbnail for image: ${imagePath} (size: ${fileSizeInKB} KB)`
      );
    }

    if (fileSizeInKB >= 800) {
      // Generate large thumbnail
      await sharp(imagePath)
        .resize(800, 800, { fit: "inside" })
        .toFile(thumbnailPath.replace(".jpg", "_lg.jpg"));
      console.log(`Large thumbnail generated for image: ${imagePath}`);
    } else {
      console.log(
        `Skipping large thumbnail for image: ${imagePath} (size: ${fileSizeInKB} KB)`
      );
    }
  } catch (error) {
    console.error(`Error generating thumbnail for image: ${imagePath}`, error);
  }
}

async function generateVideoThumbnail(videoPath, thumbnailPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        folder: path.dirname(thumbnailPath),
        filename: path.basename(thumbnailPath),
        size: "200x?",
      })
      .on("end", async () => {
        console.log(`Thumbnail generated for video: ${videoPath}`);

        // Generate medium thumbnail
        await ffmpeg(videoPath)
          .screenshots({
            count: 1,
            folder: path.dirname(thumbnailPath),
            filename: path.basename(thumbnailPath).replace(".jpg", "_md.jpg"),
            size: "400x?",
          })
          .on("end", () => {
            console.log(`Medium thumbnail generated for video: ${videoPath}`);
          })
          .on("error", (error) => {
            console.error(
              `Error generating medium thumbnail for video: ${videoPath}`,
              error
            );
            reject(error);
          });

        // Generate large thumbnail
        await ffmpeg(videoPath)
          .screenshots({
            count: 1,
            folder: path.dirname(thumbnailPath),
            filename: path.basename(thumbnailPath).replace(".jpg", "_lg.jpg"),
            size: "800x?",
          })
          .on("end", () => {
            console.log(`Large thumbnail generated for video: ${videoPath}`);
          })
          .on("error", (error) => {
            console.error(
              `Error generating large thumbnail for video: ${videoPath}`,
              error
            );
            reject(error);
          });

        resolve();
      })
      .on("error", (error) => {
        console.error(
          `Error generating thumbnail for video: ${videoPath}`,
          error
        );
        reject(error);
      });
  });
}

module.exports = {
  generateImageThumbnail,
  generateVideoThumbnail,
};
