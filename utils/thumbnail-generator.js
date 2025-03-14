const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");

async function generateImageThumbnail(imagePath, thumbnailPath) {
  try {
    await sharp(imagePath)
      .resize(200, 200, { fit: "inside" })
      .toFile(thumbnailPath);
    console.log(`Thumbnail generated for image: ${imagePath}`);

    // Generate medium thumbnail
    await sharp(imagePath)
      .resize(400, 400, { fit: "inside" })
      .toFile(thumbnailPath.replace(".jpg", "_md.jpg"));
    console.log(`Medium thumbnail generated for image: ${imagePath}`);

    // Generate large thumbnail
    await sharp(imagePath)
      .resize(800, 800, { fit: "inside" })
      .toFile(thumbnailPath.replace(".jpg", "_lg.jpg"));
    console.log(`Large thumbnail generated for image: ${imagePath}`);
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
