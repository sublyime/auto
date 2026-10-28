<?php
declare(strict_types=1);

$configPath = dirname(__DIR__, 2) . '/sublyime-config.php';
if (!is_file($configPath)) {
    api_json(503, ['error' => 'The shared world is not configured. Add sublyime-config.php outside the website root.']);
}

$config = require $configPath;
if (!is_array($config)) {
    api_json(500, ['error' => 'The private website configuration is invalid.']);
}

function api_json(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: same-origin');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function api_require_same_origin(): void
{
    if (!isset($_SERVER['HTTP_ORIGIN'])) {
        return;
    }

    $origin = parse_url($_SERVER['HTTP_ORIGIN']);
    $requestHost = parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST);
    $originHost = is_array($origin) ? ($origin['host'] ?? null) : null;
    $requestPort = (int) ($_SERVER['SERVER_PORT'] ?? 0);
    $originPort = is_array($origin)
        ? (int) ($origin['port'] ?? (($origin['scheme'] ?? '') === 'https' ? 443 : 80))
        : 0;
    if (!is_string($requestHost) || !is_string($originHost)
        || strtolower($originHost) !== strtolower($requestHost)
        || ($requestPort !== 0 && $originPort !== $requestPort)) {
        api_json(403, ['error' => 'Cross-origin requests are not allowed.']);
    }

    $requestScheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    if (isset($origin['scheme']) && strtolower($origin['scheme']) !== $requestScheme) {
        api_json(403, ['error' => 'Cross-origin requests are not allowed.']);
    }
}

function api_read_json(int $maxBytes = 4096): array
{
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') {
        api_json(415, ['error' => 'Send the request as JSON.']);
    }
    $length = filter_var($_SERVER['CONTENT_LENGTH'] ?? null, FILTER_VALIDATE_INT);
    if ($length === false || $length < 1 || $length > $maxBytes) {
        api_json(413, ['error' => 'The request is empty or too large.']);
    }
    $body = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($body === false || strlen($body) > $maxBytes) {
        api_json(413, ['error' => 'The request is too large.']);
    }
    try {
        $data = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
    } catch (JsonException) {
        api_json(400, ['error' => 'The request must contain valid JSON.']);
    }
    if (!is_array($data)) {
        api_json(400, ['error' => 'The request must be a JSON object.']);
    }
    return $data;
}

function api_db(): PDO
{
    global $config;
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    foreach (['db_host', 'db_name', 'db_user', 'db_password'] as $required) {
        if (!isset($config[$required]) || !is_string($config[$required]) || $config[$required] === '') {
            api_json(503, ['error' => 'The shared-world database settings are incomplete.']);
        }
    }
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=utf8mb4',
        $config['db_host'],
        $config['db_name']
    );
    try {
        $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (PDOException $error) {
        error_log('Sublyime database connection failed: ' . $error->getMessage());
        api_json(503, ['error' => 'The shared-world database is unavailable.']);
    }
    return $pdo;
}

function api_initial_state(): array
{
    return [
        'creature' => ['x' => 15, 'y' => 8, 'location' => 'garden'],
        'thought' => 'I wonder what the moss is dreaming about.',
        'want' => 'I want to see what’s growing in the garden.',
        'needs' => ['rest' => 78, 'curiosity' => 56, 'company' => 68, 'making' => 48],
        'skills' => [],
        'wishes' => [
            ['id' => 'wish-rain', 'text' => 'a window to watch the rain', 'type' => 'want', 'found' => false],
            ['id' => 'wish-notebook', 'text' => 'a little notebook for its ideas', 'type' => 'need', 'found' => false],
        ],
        'works' => [
            [
                'id' => 'world-cloud',
                'title' => 'A cloud’s old address',
                'description' => 'Somewhere between the sea and a sleepy afternoon, there might be a place clouds still call home.',
                'form' => 'A small thought',
                'symbol' => '☁',
                'createdAt' => gmdate(DATE_ATOM),
            ],
            [
                'id' => 'world-forecast',
                'title' => 'Pocket-sized weather',
                'description' => 'One warm sunbeam, two quiet breezes, and a chance of tiny things going right.',
                'form' => 'A tiny forecast',
                'symbol' => '☼',
                'createdAt' => gmdate(DATE_ATOM),
            ],
        ],
        'totalCreations' => 2,
        'recentThoughts' => [],
    ];
}

function api_get_shared_world(PDO $pdo, bool $lock = false): array
{
    $insert = $pdo->prepare(
        'INSERT IGNORE INTO sublyime_world (id, map_seed, state_json, visitors, updated_at) '
        . 'VALUES (1, :seed, :state, 0, CURRENT_TIMESTAMP)'
    );
    $insert->execute([
        'seed' => random_int(100000, 2147483646),
        'state' => json_encode(
            api_initial_state(),
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        ),
    ]);
    $statement = $pdo->query(
        'SELECT map_seed, state_json, visitors FROM sublyime_world WHERE id = 1'
        . ($lock ? ' FOR UPDATE' : '')
    );
    $row = $statement->fetch();
    if (!is_array($row)) {
        api_json(503, ['error' => 'The shared world could not be loaded.']);
    }
    try {
        $state = json_decode($row['state_json'], true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        error_log('Sublyime world state is invalid: ' . $error->getMessage());
        api_json(503, ['error' => 'The shared world has invalid saved data.']);
    }
    if (!is_array($state)) {
        api_json(503, ['error' => 'The shared world has invalid saved data.']);
    }
    return [
        'seed' => (int) $row['map_seed'],
        'visitors' => (int) $row['visitors'],
        'state' => $state,
    ];
}

function api_save_shared_world(PDO $pdo, int $visitors, array $state): void
{
    $statement = $pdo->prepare(
        'UPDATE sublyime_world SET state_json = :state, visitors = :visitors, updated_at = CURRENT_TIMESTAMP WHERE id = 1'
    );
    $statement->execute([
        'state' => json_encode($state, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
        'visitors' => $visitors,
    ]);
}

function api_safe_text(mixed $value, int $maxLength, string $field): string
{
    if (!is_string($value)) {
        api_json(400, ['error' => $field . ' must be text.']);
    }
    $value = trim($value);
    if ($value === '' || mb_strlen($value) > $maxLength) {
        api_json(400, ['error' => $field . ' must contain 1–' . $maxLength . ' characters.']);
    }
    return $value;
}

function api_rate_limit(PDO $pdo, int $limit = 30): void
{
    global $config;
    if (empty($config['app_secret']) || !is_string($config['app_secret']) || strlen($config['app_secret']) < 32) {
        api_json(503, ['error' => 'Set a random app_secret of at least 32 characters in the private configuration.']);
    }
    $address = $_SERVER['REMOTE_ADDR'] ?? '';
    $client = hash_hmac('sha256', $address, $config['app_secret']);
    $pdo->prepare('DELETE FROM sublyime_rate_limits WHERE window_started < UTC_TIMESTAMP() - INTERVAL 1 HOUR')
        ->execute();
    $statement = $pdo->prepare(
        'INSERT INTO sublyime_rate_limits (client_hash, window_started, request_count) '
        . 'VALUES (:client, UTC_TIMESTAMP(), 1) '
        . 'ON DUPLICATE KEY UPDATE '
        . 'request_count = IF(window_started < UTC_TIMESTAMP() - INTERVAL 1 MINUTE, 1, request_count + 1), '
        . 'window_started = IF(window_started < UTC_TIMESTAMP() - INTERVAL 1 MINUTE, UTC_TIMESTAMP(), window_started)'
    );
    $statement->execute(['client' => $client]);
    $statement = $pdo->prepare('SELECT request_count FROM sublyime_rate_limits WHERE client_hash = :client');
    $statement->execute(['client' => $client]);
    if ((int) $statement->fetchColumn() > $limit) {
        api_json(429, ['error' => 'Please give Sublyime a little more time before visiting again.']);
    }
}

function api_world_response(array $world): array
{
    return [
        'seed' => $world['seed'],
        'visitors' => $world['visitors'],
        'creature' => $world['state']['creature'],
        'thought' => $world['state']['thought'],
        'want' => $world['state']['want'],
        'needs' => $world['state']['needs'],
        'skills' => $world['state']['skills'],
        'wishes' => $world['state']['wishes'],
        'works' => array_slice($world['state']['works'], 0, 12),
        'totalCreations' => $world['state']['totalCreations'],
    ];
}

function api_check_gemini_consent(array $data): bool
{
    if (!isset($data['ai']) || !is_bool($data['ai'])) {
        api_json(400, ['error' => 'Choose whether to use Gemini.']);
    }
    return $data['ai'];
}
