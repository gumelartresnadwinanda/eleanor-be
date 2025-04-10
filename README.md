# Eleanor Media Server

Media Library Server - Electronic Library for Entertainment, Audio, and ORganization

Eleanor Media Server is a media server application for managing and serving media files on your local server.

## Features

- Manage media files (videos, music, etc.)
- Create and manage playlists
- Track server health and active users

## Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/gumelartresnadwinanda/eleanor-be.git
   cd eleanor-be
   ```

2. Install dependencies:

   ```sh
   yarn install
   ```

3. Create a `.env` file in the root directory and add the following environment variables:

   ```plaintext
   # Cookie settings
   COOKIE_DOMAIN=your_cookie_domain
   COOKIE_NAME=your_cookie_name

   # CORS settings
   CORS_ORIGINS=http://localhost:3000,http://localhost:3001,http://localhost:3002

   # Database settings
   DB_HOST=your_db_host
   DB_NAME=your_db_name
   DB_PASSWORD=your_db_password
   DB_PORT=your_db_port
   DB_USER=your_db_user

   # Security settings
   JWT_SECRET=your_jwt_secret

   # Media Scan settings
   MEDIA_FOLDER=your_media_folder
   MEDIA_OUTPUT_FILE=your_output_file
   MEDIA_TAGS=your_media_tags
   MEDIA_TEST_MODE=false
   MEDIA_IS_PROTECTED=false
   MEDIA_RECURSIVE_CHECK=false
   USE_DIRECTORY_TAGS=true

   SCAN_DIRECTORY=your_scan_directory
   SCAN_OUTPUT_FILE=your_scan_output_file

   MEDIA_OPTIMIZE_FOLDER=your_media_optimize_folder

   # Server settings
   SERVER_PORT=your_server_port
   SERVER_URL=your_server_url
   ```

## Usage

1. Run the migrations to set up the database:

   ```sh
   yarn knex migrate:latest
   ```

2. Start the server:

   ```sh
   yarn dev
   ```

3. The server will be running on `http://localhost:5002`.

## Utility Functions

### Video Optimizer

The `video-optimizer.js` script optimizes video files in the specified media folder. It converts `.MOV` files to `.mp4` format and logs the results.

Run the script:

```sh
yarn optimize-videos
```

### Update Created Date

The `update-created-date.js` script updates the `created_at` field in the database for `.mp4` files based on the creation date of their corresponding `.MOV` files.

Run the script:

```sh
yarn update-created-date
```

### Thumbnail Generator

The `thumbnail-generator.js` script generates thumbnails for image and video files. It creates small, medium, and large thumbnails for each file.

### Thumbnail Creator

The `thumbnail-creator.js` script scans the media folder and generates thumbnails for supported media files.

Run the script:

```sh
yarn create-thumbnails
```

### Media Scanner

The `media-scanner.js` script scans the media folder, extracts metadata, generates thumbnails, and inserts the data into the database.

Run the script:

```sh
yarn scan-media
```

### Directory Scanner

The `directory-scanner.js` script scans the specified directory and saves the list of directories to a JSON file.

Run the script:

```sh
yarn scan-directories
```

## Albums

### Album Management

Albums allow you to group media files into collections. Each album can have metadata such as:

- **Cover URL**: The primary cover image for the album.
- **Fallback Cover URL**: A secondary cover image to use if the primary is unavailable.
- **Online Album URLs**: A list of external URLs referencing the album, stored as a JSON array.
- **Tags**: Metadata tags for categorization.
- **Ownership Information**: The owner of the album.

### API Endpoints

- **Fetch Media in an Album**: `/medias/albums/:albumId/media`
  - Includes `fallback_cover_url` and `online_album_urls` in the album metadata.
- **Fetch Albums in a Playlist**: `/playlists/:playlistId/albums`
  - Includes `fallback_cover_url` and `online_album_urls` in the album metadata.

## Favorite Albums

### Favorite Albums Management

Users can mark albums as their favorites. The following API endpoints are available for managing favorite albums:

### API Endpoints

- **Fetch Favorite Albums**: `/medias/favorites`

  - Query Parameters:
    - `user_identifier` (required): The identifier for the user (e.g., username or email).
  - Response: A list of favorite albums for the user.

- **Add Album to Favorites**: `/medias/favorites` (POST)

  - Body:
    - `user_identifier` (required): The identifier for the user.
    - `album_id` (required): The ID of the album to add to favorites.
  - Response: Confirmation message.

- **Remove Album from Favorites**: `/medias/favorites` (DELETE)
  - Body:
    - `user_identifier` (required): The identifier for the user.
    - `album_id` (required): The ID of the album to remove from favorites.
  - Response: Confirmation message.

## License

This project is licensed under the MIT License.
