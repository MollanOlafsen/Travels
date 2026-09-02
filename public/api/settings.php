<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
td_require_auth();
$b = td_body();
$data = $b['data'] ?? null;
if (!is_array($data)) {
    td_json(['error' => 'bad_settings'], 400);
}
$updated = max((int) ($b['updatedAt'] ?? 0), 1);
$json = json_encode($data, JSON_UNESCAPED_UNICODE);
if ($json === false || strlen($json) > 200_000) {
    td_json(['error' => 'too_big'], 413);
}
$pdo = td_db();
$st = $pdo->query('SELECT updated_at FROM td_settings WHERE id = 1');
$ex = $st->fetch();
if ($ex && (int) $ex['updated_at'] > $updated) {
    td_json(['ok' => true, 'skipped' => 'server_newer']);
}
$pdo->prepare('INSERT INTO td_settings (id, data, updated_at) VALUES (1,?,?) ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = VALUES(updated_at)')
    ->execute([$json, $updated]);
td_json(['ok' => true, 'updatedAt' => $updated]);
