# Sublyime

Sublyime's home includes a small top-down exploration game. Each shared-world
seed creates a meadow layout with a pond, paths, trees, a garden, a home, and a
making nook. Visitors explore with WASD or arrow keys, or the on-screen buttons
on touch devices; Enter, Space, and **Say hello** interact with nearby places.
The map generator and creature's movement are lightweight browser JavaScript,
not a game engine or Node.js service.

The shared IONOS setup uses PHP and MySQL. The PHP endpoints store the map seed,
creature state, works, visitor wishes, and skills so visitors can encounter one
shared world. Visitor skill and wish submissions are public to other visitors;
do not submit private details. Each visitor's explorer position is local to
their browser. The Python server is optional for local prototyping only; it is
not part of the shared-hosting deployment.

## What you'll need from IONOS

Check the Hosting section in your own IONOS account: package entitlements can
differ by country and contract. The PHP/MySQL version of Sublyime needs:

- A PHP 8.1+ web space with `PDO`, `pdo_mysql`, and `mbstring`.
- A MySQL/MariaDB database and its hostname, database name, user, and password.
- HTTPS enabled for `sublyime.com`.
- PHP's HTTPS stream wrapper (`allow_url_fopen`) if you enable the optional
  server-side Gemini integration.

No VPS, Node.js, Python runtime, or process manager is required on IONOS.

## Publish the shared world

1. In IONOS, create a MySQL database and make a note of its host, name, username,
   and password.
2. In the database's phpMyAdmin, select that database and run [`database.sql`](./database.sql).
3. Generate an unpredictable secret of at least 32 characters and create
   `sublyime-config.php` **outside** the public website directory. For example,
   if the website files live in `htdocs/`, place the config in its parent
   directory. Use [`sublyime-config.example.php`](./sublyime-config.example.php)
   as a template. Fill in the database settings, your generated `app_secret`,
   and optionally the Gemini settings.
4. Upload the site files to the web root. Upload `index.html`, `styles.css`,
   `app.js`, and `world.js`; upload the `api/` folder and root `.htaccess`.
   Do not upload the Python server or public example configuration to production.
5. Visit `https://sublyime.com/api/world.php`. A working connection responds
   with JSON containing the shared world's generated seed and state.
6. Visit `https://sublyime.com`. The world is generated deterministically from
   its shared seed, so every visitor sees the same map layout. Visitor positions
   are private to each browser; creature visits, conversations, shared skills,
   and wishes update the shared world in MySQL.

The PHP configuration is loaded from two levels above `api/`; place it outside
the public directory as shown. Keep the database password, `app_secret`, and any
Gemini API key private. Never put them in website JavaScript or commit them.

## Optional Gemini thoughts

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Put the key in the private `sublyime-config.php` as `gemini_api_key`.
3. Reload the website. Gemini opt-in starts unchecked. Only after a visitor
   checks it will the site send the described shared skills, wishes, needs, and
   action context to Google.

Gemini availability depends on the PHP host allowing outgoing HTTPS requests.
If the service is not configured or cannot respond, visitors can continue
exploring the locally generated world. Configure billing limits and monitor
provider usage before enabling the key on a public site.

## Local visual preview

Open `index.html` directly or serve the files from a local static web server.
Without a PHP/MySQL backend, the game opens a local preview; the page tells you
that shared saves are unavailable. The optional `server.py` is a separate
prototype backend and is **not** required or used by IONOS shared hosting.
