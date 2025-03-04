# Eleanor Media Server

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
   npm install
   ```

3. Create a `.env` file in the root directory and add the following environment variables:
   ```plaintext
   DB_USER=your_db_user
   DB_PASSWORD=your_db_password
   DB_NAME=your_db_name
   DB_HOST=your_db_host
   DB_PORT=your_db_port
   JWT_SECRET=your_jwt_secret
   COOKIE_NAME=your_cookie_name
   COOKIE_DOMAIN=your_cookie_domain
   CORS_ORIGINS=your_cors_origins
   ```

## Usage

1. Run the migrations to set up the database:

   ```sh
   npx knex migrate:latest
   ```

2. Start the server:

   ```sh
   npm run dev
   ```

3. The server will be running on `http://localhost:5435`.

## License

This project is licensed under the MIT License.
