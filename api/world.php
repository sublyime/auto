<?php
declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $world = api_get_shared_world(api_db());
    } catch (PDOException $error) {
        error_log('Sublyime world load failed: ' . $error->getMessage());
        api_json(503, ['error' => 'The shared world is unavailable. Check the database setup.']);
    }
    api_json(200, [
        ...api_world_response($world),
        'aiConfigured' => !empty($config['gemini_api_key']),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    api_json(405, ['error' => 'Use GET or POST for the shared world.']);
}

api_require_same_origin();
$input = api_read_json();
$type = api_safe_text($input['type'] ?? null, 16, 'Action');
$validTypes = ['explore', 'greet', 'garden', 'pond', 'tree', 'workshop', 'home', 'skill', 'wish', 'found', 'creation', 'ai'];
if (!in_array($type, $validTypes, true)) {
    api_json(400, ['error' => 'That world action is not available.']);
}

try {
    $pdo = api_db();
    api_rate_limit($pdo);
    $pdo->beginTransaction();
    $world = api_get_shared_world($pdo, true);
    $state = $world['state'];
    $state['needs'] = array_merge(['rest' => 70, 'curiosity' => 60, 'company' => 60, 'making' => 50], $state['needs'] ?? []);
    $state['creature'] = array_merge(['x' => 15, 'y' => 8, 'location' => 'garden'], $state['creature'] ?? []);
    $thought = null;

    if ($type === 'explore') {
        foreach (['x' => 30, 'y' => 19] as $axis => $bound) {
            if (!isset($input[$axis]) || !is_int($input[$axis]) || $input[$axis] < 1 || $input[$axis] >= $bound - 1) {
                api_json(400, ['error' => 'The explorer is outside the meadow.']);
            }
        }
    } elseif ($type === 'skill') {
        $text = api_safe_text($input['text'] ?? null, 48, 'Skill');
        $skills = $state['skills'] ?? [];
        if (!in_array(mb_strtolower($text), array_map('mb_strtolower', $skills), true)) {
            array_unshift($skills, $text);
        }
        $state['skills'] = array_slice($skills, 0, 30);
        $state['want'] = 'I want to try a new idea with what I’ve learned.';
        $thought = 'A visitor shared “' . $text . '” with Sublyime. The little world is keeping that lesson.';
    } elseif ($type === 'wish') {
        $text = api_safe_text($input['text'] ?? null, 64, 'Wish');
        $wishType = $input['wishType'] ?? null;
        if (!in_array($wishType, ['want', 'need'], true)) {
            api_json(400, ['error' => 'A wish must be marked as a want or need.']);
        }
        array_unshift($state['wishes'], [
            'id' => bin2hex(random_bytes(8)),
            'text' => $text,
            'type' => $wishType,
            'found' => false,
        ]);
        $state['wishes'] = array_slice($state['wishes'], 0, 30);
        $state['want'] = $wishType === 'need'
            ? 'I want to remember this need: ' . $text . '.'
            : 'I am dreaming about: ' . $text . '.';
        $thought = 'A visitor left a ' . $wishType . ' in the wish garden: “' . $text . '”.';
    } elseif ($type === 'found') {
        $wishId = api_safe_text($input['id'] ?? null, 32, 'Wish');
        $found = false;
        foreach ($state['wishes'] as &$wish) {
            if (($wish['id'] ?? '') === $wishId) {
                $wish['found'] = !($wish['found'] ?? false);
                $found = true;
                break;
            }
        }
        unset($wish);
        if (!$found) {
            api_json(404, ['error' => 'That wish is no longer in the shared garden.']);
        }
        $thought = 'A visitor checked on one of the shared wishes.';
    } elseif ($type === 'creation') {
        $symbol = $input['symbol'] ?? null;
        if (!is_string($symbol) || !in_array($symbol, ['☁', '✳', '♫', '⌁', '❋', '☼', '✉'], true)) {
            api_json(400, ['error' => 'The creation symbol is not supported.']);
        }
        array_unshift($state['works'], [
            'id' => bin2hex(random_bytes(8)),
            'title' => api_safe_text($input['title'] ?? null, 60, 'Creation title'),
            'description' => api_safe_text($input['description'] ?? null, 220, 'Creation description'),
            'form' => api_safe_text($input['form'] ?? null, 40, 'Creation form'),
            'symbol' => $symbol,
            'createdAt' => gmdate(DATE_ATOM),
        ]);
        $state['works'] = array_slice($state['works'], 0, 12);
        $state['totalCreations'] = (int) ($state['totalCreations'] ?? 0) + 1;
        $state['needs']['making'] = min(100, (int) ($state['needs']['making'] ?? 50) + 22);
        $title = api_safe_text($input['title'] ?? null, 60, 'Creation title');
        $state['want'] = 'I want to see how this little idea feels in the world.';
        $thought = 'Sublyime made “' . $title . '”.';
    } elseif ($type === 'ai') {
        if (empty($config['gemini_api_key']) || ($input['ai'] ?? null) !== true) {
            api_json(403, ['error' => 'AI-generated thoughts require visitor opt-in and a configured Gemini key.']);
        }
        $thought = api_safe_text($input['thought'] ?? null, 240, 'Thought');
        $state['want'] = api_safe_text($input['want'] ?? null, 160, 'Want');
        if (isset($input['creation']) && is_array($input['creation'])) {
            $creation = $input['creation'];
            $symbol = $creation['symbol'] ?? null;
            if (!in_array($symbol, ['☁', '✳', '♫', '⌁', '❋', '☼', '✉'], true)) {
                api_json(400, ['error' => 'The creation symbol is not supported.']);
            }
            array_unshift($state['works'], [
                'id' => bin2hex(random_bytes(8)),
                'title' => api_safe_text($creation['title'] ?? null, 60, 'Creation title'),
                'description' => api_safe_text($creation['description'] ?? null, 220, 'Creation description'),
                'form' => api_safe_text($creation['form'] ?? null, 40, 'Creation form'),
                'symbol' => $symbol,
                'createdAt' => gmdate(DATE_ATOM),
            ]);
            $state['works'] = array_slice($state['works'], 0, 12);
            $state['totalCreations'] = (int) ($state['totalCreations'] ?? 0) + 1;
            $state['needs']['making'] = min(100, (int) ($state['needs']['making'] ?? 50) + 22);
        }
    } elseif ($type === 'greet') {
        foreach (['x' => 30, 'y' => 19] as $axis => $bound) {
            if (!isset($input[$axis]) || !is_int($input[$axis]) || $input[$axis] < 1 || $input[$axis] >= $bound - 1) {
                api_json(400, ['error' => 'The explorer is outside the meadow.']);
            }
        }
        $state['creature']['x'] = min(28, $input['x'] + ($input['x'] < 28 ? 1 : -1));
        $state['creature']['y'] = $input['y'];
        $state['creature']['location'] = 'visitor';
        $state['needs']['company'] = min(100, ($state['needs']['company'] ?? 50) + 10);
        $state['want'] = 'I want a friendly moment with whoever is visiting.';
        $thought = 'Sublyime looks up from the path. “I’m glad you’re here. What shall we discover?”';
    } else {
        foreach (['x' => 30, 'y' => 19] as $axis => $bound) {
            if (!isset($input[$axis]) || !is_int($input[$axis]) || $input[$axis] < 1 || $input[$axis] >= $bound - 1) {
                api_json(400, ['error' => 'The explorer is outside the meadow.']);
            }
        }
        $places = [
            'garden' => ['thought' => 'The wish garden is full of little seedlings. Sublyime wonders what you’d like to grow.'],
            'pond' => ['thought' => 'The moon pond catches a piece of sky. Sublyime leans close to watch the ripples wander.'],
            'tree' => ['thought' => 'The listening tree has been here a very long time. It keeps every kind visitor’s story in its leaves.'],
            'workshop' => ['thought' => 'A few half-finished ideas cover the making nook. Sublyime is always happy to begin another.'],
            'home' => ['thought' => 'A small warm light glows in the window. This is Sublyime’s own little home.'],
        ];
        $state['creature']['x'] = $input['x'];
        $state['creature']['y'] = min(17, $input['y'] + 1);
        $state['creature']['location'] = $type;
        $state['want'] = $type === 'workshop'
            ? 'I want to turn an idea into a little creation.'
            : 'I want to explore the ' . ($type === 'tree' ? 'listening tree' : $type) . '.';
        $thought = $places[$type]['thought'];
    }

    if ($thought !== null) {
        $state['thought'] = $thought;
        array_unshift($state['recentThoughts'], ['text' => $thought, 'at' => gmdate(DATE_ATOM)]);
        $state['recentThoughts'] = array_slice($state['recentThoughts'], 0, 20);
    }
    if ($type !== 'explore') {
        $world['visitors'] += 1;
    }
    api_save_shared_world($pdo, $world['visitors'], $state);
    $pdo->commit();
    api_json(200, [...api_world_response(['seed' => $world['seed'], 'visitors' => $world['visitors'], 'state' => $state]), 'thought' => $thought]);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Sublyime world update failed: ' . $error->getMessage());
    api_json(503, ['error' => 'The shared world could not save that visit.']);
}
