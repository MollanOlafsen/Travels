<?php
// Full sikkerhetskopi (JSON) fra serveren, inkl. bilder som base64.
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_auth();
$pdo = td_db();
$settings = null;
if ($r = $pdo->query('SELECT data FROM td_settings WHERE id = 1')->fetch()) {
    $settings = json_decode($r['data'], true);
}
$segments = [];
foreach ($pdo->query('SELECT data FROM td_segments WHERE deleted = 0 ORDER BY date') as $r) {
    $segments[] = json_decode($r['data'], true);
}
$images = [];
foreach ($pdo->query('SELECT * FROM td_images WHERE deleted = 0') as $r) {
    $plain = td_decrypt_file(td_image_path($r['id']));
    if ($plain === null) {
        continue;
    }
    $images[] = [
        'id' => $r['id'],
        'name' => $r['name'],
        'mime' => $r['mime'],
        'width' => (int) $r['width'],
        'height' => (int) $r['height'],
        'createdAt' => (int) $r['created_at'],
        'rawBarcode' => $r['raw_barcode'],
        'ocrText' => $r['ocr_text'],
        'dataUrl' => 'data:' . $r['mime'] . ';base64,' . base64_encode($plain),
    ];
}
td_audit('backup_downloaded');
header('Content-Disposition: attachment; filename="traveldays-sikkerhetskopi-' . gmdate('Y-m-d') . '.json"');
td_json(['app' => 'traveldays', 'version' => 2, 'exportedAt' => gmdate('c'), 'settings' => $settings, 'segments' => $segments, 'images' => $images]);
