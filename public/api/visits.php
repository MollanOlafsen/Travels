<?php
// Besøk i franske departementer (regionsmålet). Samme modell som segments.php: siste skriver vinner, myk sletting.
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
td_require_auth();
$b = td_body();
$op = (string) ($b['op'] ?? '');
$pdo = td_db();
td_ensure_visits($pdo);
$now = td_now_ms();

if ($op === 'put') {
    $v = $b['visit'] ?? null;
    if (!is_array($v) || !isset($v['id']) || !td_valid_uuid((string) $v['id'])) {
        td_json(['error' => 'bad_visit'], 400);
    }
    $date = (string) ($v['date'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        td_json(['error' => 'bad_date'], 400);
    }
    $dept = (string) ($v['dept'] ?? '');
    if (!preg_match('/^(\d{2}|2A|2B)$/', $dept)) {
        td_json(['error' => 'bad_dept'], 400);
    }
    $updated = max((int) ($v['updatedAt'] ?? 0), 1);
    $st = $pdo->prepare('SELECT updated_at FROM td_visits WHERE id = ?');
    $st->execute([$v['id']]);
    $existing = $st->fetch();
    if ($existing && (int) $existing['updated_at'] > $updated) {
        td_json(['ok' => true, 'skipped' => 'server_newer']);
    }
    $v['updatedAt'] = $updated;
    $json = json_encode($v, JSON_UNESCAPED_UNICODE);
    if ($json === false || strlen($json) > 200_000) {
        td_json(['error' => 'too_big'], 413);
    }
    $pdo->prepare('INSERT INTO td_visits (id, date, dept, data, updated_at, deleted) VALUES (?,?,?,?,?,0)
        ON DUPLICATE KEY UPDATE date = VALUES(date), dept = VALUES(dept), data = VALUES(data), updated_at = VALUES(updated_at), deleted = 0')
        ->execute([$v['id'], $date, $dept, $json, $updated]);
    td_json(['ok' => true, 'updatedAt' => $updated]);
}

if ($op === 'delete') {
    $id = (string) ($b['id'] ?? '');
    if (!td_valid_uuid($id)) {
        td_json(['error' => 'bad_id'], 400);
    }
    $pdo->prepare('UPDATE td_visits SET deleted = 1, data = "{}", updated_at = ? WHERE id = ?')->execute([$now, $id]);
    td_json(['ok' => true]);
}

td_json(['error' => 'bad_op'], 400);
