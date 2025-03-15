const fs = require("fs").promises;
const path = require("path");

async function findMissingThumbnails(directoryPath, missingThumbnails = []) {
  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(directoryPath, file.name);
      const ext = path.extname(file.name).toLowerCase();
      const thumbnailDir = path.join(directoryPath, "thumbnails");

      if (file.isDirectory() && file.name !== "thumbnails") {
        await findMissingThumbnails(filePath, missingThumbnails); // Recursively process subdirectories
      } else if (
        [".jpg", ".jpeg", ".png", ".mp4", ".avi", ".mkv"].includes(ext)
      ) {
        const baseName = `thumb_${path.basename(filePath, ext)}`;
        const thumbnailPaths = [
          path.join(thumbnailDir, `${baseName}.jpg`),
          path.join(thumbnailDir, `${baseName}_md.jpg`),
          path.join(thumbnailDir, `${baseName}_lg.jpg`),
        ];

        const missing = [];
        for (const thumbnailPath of thumbnailPaths) {
          try {
            await fs.access(thumbnailPath);
          } catch (error) {
            if (error.code === "ENOENT") {
              missing.push(thumbnailPath);
            } else {
              console.error(
                `Error checking thumbnail existence for file: ${filePath}`,
                error
              );
            }
          }
        }

        if (missing.length > 0) {
          missingThumbnails.push({ file: filePath, missing });
        } else {
          console.log(`All thumbnails exist for file: ${filePath}`);
        }
      }
    }

    return missingThumbnails;
  } catch (error) {
    console.error(`Error processing directory: ${directoryPath}`, error);
    throw error;
  }
}

async function findThumbnailsWithoutFile(
  directoryPath,
  orphanThumbnails = new Set()
) {
  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });

    for (const file of files) {
      const filePath = path.join(directoryPath, file.name);
      const ext = path.extname(file.name).toLowerCase();

      if (file.isDirectory()) {
        await findThumbnailsWithoutFile(filePath, orphanThumbnails); // Recursively process subdirectories
      } else if (file.name.startsWith("thumb_") && [".jpg"].includes(ext)) {
        const originalFileName = file.name
          .replace(/^thumb_/, "")
          .replace(/(_md|_lg)?\.jpg$/, "");
        const originalFilePath = path.join(
          path.dirname(directoryPath),
          originalFileName.replace(".JPG", "")
        );

        try {
          const possibleExtensions = [
            ".jpg",
            ".jpeg",
            ".png",
            ".mp4",
            ".avi",
            ".mkv",
          ];
          let fileExists = false;

          for (const ext of possibleExtensions) {
            try {
              await fs.access(originalFilePath + ext);
              fileExists = true;
              break;
            } catch (error) {
              if (error.code !== "ENOENT") {
                throw error;
              }
            }
            // Check for case-insensitive file extensions specifically for .JPG
            if (ext === ".jpg" || file.name.includes("JPG")) {
              try {
                await fs.access(originalFilePath + ext.toUpperCase());
                fileExists = true;
                break;
              } catch (error) {
                if (error.code !== "ENOENT") {
                  throw error;
                }
              }
            }
          }

          if (!fileExists) {
            orphanThumbnails.add(originalFilePath + ext.toUpperCase());
            try {
              await fs.unlink(filePath);
              console.log(`Deleted orphan thumbnail: ${filePath}`);
            } catch (error) {
              console.error(
                `Error deleting orphan thumbnail: ${filePath}`,
                error
              );
            }
          }
        } catch (error) {
          if (error.code === "ENOENT") {
            orphanThumbnails.add(originalFilePath + ext.toUpperCase());
          } else {
            console.error(
              `Error checking original file existence for thumbnail: ${filePath}`,
              error
            );
          }
        }
      }
    }

    return Array.from(orphanThumbnails);
  } catch (error) {
    console.error(`Error processing directory: ${directoryPath}`, error);
    throw error;
  }
}

module.exports = {
  findMissingThumbnails,
  findThumbnailsWithoutFile,
};
