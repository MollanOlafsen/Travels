<?php
// Henter alt som er endret siden ?since=<ms>. since=0 → full tilstand (uten slettede).
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_auth();
$since = max(0, (int) ($_GET['since'] ?? 0));
$pdo = td_db();
$now = td_now_ms();

$segs = [];
$st = $pdo->prepare('SELECT id, data, updated_at, deleted FROM td_segments WHERE updated_at > ?' . ($since === 0 ? ' AND deleted = 0' : ''));
$st->execute([$since]);
foreach ($st as $r) {
    $segs[] = ['id' => $r['id'], 'deleted' => (bool) $r['deleted'], 'updatedAt' => (int) $r['updated_at'], 'data' => (int) $r['deleted'] ? null : json_decode($r['data'], true)];
}

$imgs = [];
$st = $pdo->prepare('SELECT id, name, mime, width, height, size, raw_barcode, ocr_text, created_at, updated_at, deleted FROM td_images WHERE updated_at > ?' . ($since === 0 ? ' AND deleted = 0' : ''));
$st->execute([$since]);
foreach ($st as $r) {
    $imgs[] = [
        'id' => $r['id'],
        'deleted' => (bool) $r['deleted'],
        'updatedAt' => (int) $r['updated_at'],
        'name' => $r['name'],
        'mime' => $r['mime'],
        'width' => (int) $r['width'],
        'height' => (int) $r['height'],
        'size' => (int) $r['size'],
        'rawBarcode' => $r['raw_barcode'],
        'ocrText' => $r['ocr_text'],
        'createdAt' => (int) $r['created_at'],
    ];
}

$settings = null;
$st = $pdo->prepare('SELECT data, updated_at FROM td_settings WHERE id = 1 AND updated_at > ?');
$st->execute([$since]);
if ($r = $st->fetch()) {
    $settings = ['data' => json_decode($r['data'], true), 'updatedAt' => (int) $r['updated_at']];
}

$cnt = (int) $pdo->query('SELECT COUNT(*) c FROM td_segments WHERE deleted = 0')->fetch()['c'];

td_json(['now' => $now, 'segments' => $segs, 'images' => $imgs, 'settings' => $settings, 'serverSegmentCount' => $cnt]);
