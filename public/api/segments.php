<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
td_require_auth();
$b = td_body();
$op = (string) ($b['op'] ?? '');
$pdo = td_db();
$now = td_now_ms();

if ($op === 'put') {
    $seg = $b['segment'] ?? null;
    if (!is_array($seg) || !isset($seg['id']) || !td_valid_uuid((string) $seg['id'])) {
        td_json(['error' => 'bad_segment'], 400);
    }
    $date = (string) ($seg['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        td_json(['error' => 'bad_date'], 400);
    }
    $updated = max((int) ($seg['updatedAt'] ?? 0), 1);
    // Siste skriver vinner – ikke overskriv nyere data på serveren
    $st = $pdo->prepare('SELECT updated_at FROM td_segments WHERE id = ?');
    $st->execute([$seg['id']]);
    $existing = $st->fetch();
    if ($existing && (int) $existing['updated_at'] > $updated) {
        td_json(['ok' => true, 'skipped' => 'server_newer']);
    }
    $seg['updatedAt'] = $updated;
    $json = json_encode($seg, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 200_000) {
        td_json(['error' => 'too_big'], 413);
    }
    $pdo->prepare('INSERT INTO td_segments (id, date, data, updated_at, deleted) VALUES (?,?,?,?,0)
        ON DUPLICATE KEY UPDATE date = VALUES(date), data = VALUES(data), updated_at = VALUES(updated_at), deleted = 0')
        ->execute([$seg['id'], $date, $json, $updated]);
    td_json(['ok' => true, 'updatedAt' => $updated]);
}

if ($op === 'delete') {
    $id = (string) ($b['id'] ?? '');
    if (!td_valid_uuid($id)) {
        td_json(['error' => 'bad_id'], 400);
    }
    $pdo->prepare('UPDATE td_segments SET deleted = 1, data = "{}", updated_at = ? WHERE id = ?')->execute([$now, $id]);
    td_json(['ok' => true]);
}

td_json(['error' => 'bad_op'], 400);
