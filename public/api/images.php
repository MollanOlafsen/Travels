<?php
// Opplasting (multipart) og sletting av boardingkort-bilder. Filene krypteres og lagres utenfor webroten.
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
td_require_auth();
$pdo = td_db();
$now = td_now_ms();

$op = (string) ($_POST['op'] ?? (td_body()['op'] ?? 'upload'));

if ($op === 'delete') {
    $id = (string) (td_body()['id'] ?? $_POST['id'] ?? '');
    if (!td_valid_uuid($id)) {
        td_json(['error' => 'bad_id'], 400);
    }
    $pdo->prepare('UPDATE td_images SET deleted = 1, updated_at = ? WHERE id = ?')->execute([$now, $id]);
    @unlink(td_image_path($id));
    td_json(['ok' => true]);
}

$id = (string) ($_POST['id'] ?? '');
if (!td_valid_uuid($id)) {
    td_json(['error' => 'bad_id'], 400);
}
$meta = json_decode((string) ($_POST['meta'] ?? '{}'), true);
if (!is_array($meta)) {
    $meta = [];
}
$f = $_FILES['file'] ?? null;
if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    td_json(['error' => 'upload_failed', 'code' => $f['error'] ?? null], 400);
}
if ($f['size'] > TD_MAX_IMAGE_BYTES) {
    td_json(['error' => 'too_big'], 413);
}
$fi = new finfo(FILEINFO_MIME_TYPE);
$mime = (string) $fi->file($f['tmp_name']);
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], true)) {
    td_json(['error' => 'bad_type', 'mime' => $mime], 415);
}
$plain = file_get_contents($f['tmp_name']);
if ($plain === false) {
    td_json(['error' => 'read_failed'], 500);
}
td_encrypt_to_file($plain, td_image_path($id));

$updated = max((int) ($meta['updatedAt'] ?? 0), $now);
$pdo->prepare('INSERT INTO td_images (id, name, mime, width, height, size, raw_barcode, ocr_text, created_at, updated_at, deleted)
    VALUES (?,?,?,?,?,?,?,?,?,?,0)
    ON DUPLICATE KEY UPDATE name = VALUES(name), mime = VALUES(mime), width = VALUES(width), height = VALUES(height), size = VALUES(size),
    raw_barcode = VALUES(raw_barcode), ocr_text = VALUES(ocr_text), updated_at = VALUES(updated_at), deleted = 0')
    ->execute([
        $id,
        mb_substr((string) ($meta['name'] ?? 'boardingkort.jpg'), 0, 255),
        $mime,
        (int) ($meta['width'] ?? 0),
        (int) ($meta['height'] ?? 0),
        (int) $f['size'],
        isset($meta['rawBarcode']) ? mb_substr((string) $meta['rawBarcode'], 0, 4000) : null,
        isset($meta['ocrText']) ? mb_substr((string) $meta['ocrText'], 0, 60000) : null,
        (int) ($meta['createdAt'] ?? $now),
        $updated,
    ]);
td_json(['ok' => true, 'id' => $id, 'updatedAt' => $updated]);
