<?php
// Serverer et dekryptert bilde til innlogget bruker.
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_auth();
$id = (string) ($_GET['id'] ?? '');
if (!td_valid_uuid($id)) {
    td_json(['error' => 'bad_id'], 400);
}
$st = td_db()->prepare('SELECT mime, size FROM td_images WHERE id = ? AND deleted = 0');
$st->execute([$id]);
$row = $st->fetch();
if (!$row) {
    td_json(['error' => 'not_found'], 404);
}
$plain = td_decrypt_file(td_image_path($id));
if ($plain === null) {
    td_json(['error' => 'not_found'], 404);
}
header('Content-Type: ' . $row['mime']);
header('Content-Length: ' . strlen($plain));
header('Cache-Control: private, max-age=86400');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="boardingkort.jpg"');
echo $plain;
