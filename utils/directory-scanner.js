require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");

async function scanDirectories(directoryPath, result = [], isRoot = true) {
  try {
    const files = await fs.readdir(directoryPath, { withFileTypes: true });
    let hasFiles = false;
    let subDirectories = [];

    for (const file of files) {
      if (file.isDirectory() && !file.name.includes("thumbnails")) {
        const fullPath = path.join(directoryPath, file.name);
        const subResult = await scanDirectories(fullPath, [], false);
        if (subResult.length > 0) {
          subDirectories.push(fullPath);
          result.push(...subResult);
        }
      } else if (!file.isDirectory() && hasFiles === false) {
        hasFiles = true;
      }
    }

    if (hasFiles) {
      if (!isRoot) {
        result.push(directoryPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory: ${directoryPath}`, error);
  }
  return result;
}

module.exports = {
  scanDirectories,
};
