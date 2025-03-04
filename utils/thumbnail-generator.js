const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");

async function generateImageThumbnail(imagePath, thumbnailPath) {
  try {
    await sharp(imagePath)
      .resize(200, 200, { fit: "inside" })
      .toFile(thumbnailPath);
    console.log(`Thumbnail generated for image: ${imagePath}`);
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
      .on("end", () => {
        console.log(`Thumbnail generated for video: ${videoPath}`);
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
