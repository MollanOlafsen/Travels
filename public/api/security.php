<?php
// Passordbytte og tofaktor (TOTP).
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
td_require_auth();
$cfg = td_config();
$b = td_body();
$op = (string) ($b['op'] ?? '');

if ($op === 'password') {
    $cur = (string) ($b['current'] ?? '');
    $new = (string) ($b['new'] ?? '');
    if (!password_verify($cur, $cfg['password_hash'])) {
        sleep(1);
        td_json(['error' => 'bad_credentials'], 401);
    }
    if (strlen($new) < 12) {
        td_json(['error' => 'weak_password'], 400);
    }
    $cfg['password_hash'] = td_hash_password($new);
    td_write_config($cfg);
    // Logg ut alle andre enheter
    $keep = td_session_id_from_cookie();
    td_db()->prepare('DELETE FROM td_sessions WHERE id <> ?')->execute([$keep]);
    td_audit('password_changed');
    td_json(['ok' => true]);
}

if ($op === 'totp_begin') {
    $secret = td_base32_encode(random_bytes(20));
    // Midlertidig hemmelighet lagres i privat mappe, knyttet til sesjonen
    $tmp = td_private_dir() . '/totp_pending_' . substr((string) td_session_id_from_cookie(), 0, 16);
    file_put_contents($tmp, $secret, LOCK_EX);
    chmod($tmp, 0600);
    $label = rawurlencode('Traveldays:' . $cfg['email']);
    $uri = "otpauth://totp/$label?secret=$secret&issuer=Traveldays&algorithm=SHA1&digits=6&period=30";
    td_json(['secret' => $secret, 'otpauth' => $uri]);
}

if ($op === 'totp_enable') {
    $tmp = td_private_dir() . '/totp_pending_' . substr((string) td_session_id_from_cookie(), 0, 16);
    $secret = is_file($tmp) ? trim((string) file_get_contents($tmp)) : '';
    if ($secret === '') {
        td_json(['error' => 'no_pending'], 400);
    }
    if (!td_totp_verify($secret, (string) ($b['code'] ?? ''))) {
        sleep(1);
        td_json(['error' => 'bad_code'], 400);
    }
    $cfg['totp_secret'] = $secret;
    td_write_config($cfg);
    @unlink($tmp);
    td_audit('totp_enabled');
    td_json(['ok' => true]);
}

if ($op === 'totp_disable') {
    if (!password_verify((string) ($b['password'] ?? ''), $cfg['password_hash'])) {
        sleep(1);
        td_json(['error' => 'bad_credentials'], 401);
    }
    if (!empty($cfg['totp_secret']) && !td_totp_verify($cfg['totp_secret'], (string) ($b['code'] ?? ''))) {
        sleep(1);
        td_json(['error' => 'bad_code'], 400);
    }
    $cfg['totp_secret'] = null;
    td_write_config($cfg);
    td_audit('totp_disabled');
    td_json(['ok' => true]);
}

if ($op === 'db_password') {
    // Bytt databasepassord etter at det er endret i Domeneshop-panelet. Tester tilkoblingen før config skrives.
    if (!password_verify((string) ($b['password'] ?? ''), $cfg['password_hash'])) {
        sleep(1);
        td_json(['error' => 'bad_credentials'], 401);
    }
    $new = (string) ($b['dbPassword'] ?? '');
    if ($new === '') {
        td_json(['error' => 'bad_request'], 400);
    }
    $d = $cfg['db'];
    try {
        $test = new PDO("mysql:host={$d['host']};dbname={$d['name']};charset=utf8mb4", $d['user'], $new, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $test->query('SELECT 1');
    } catch (Throwable $e) {
        td_json(['error' => 'db_connect_failed', 'detail' => $e->getMessage()], 400);
    }
    $cfg['db']['pass'] = $new;
    td_write_config($cfg);
    td_audit('db_password_changed');
    td_json(['ok' => true]);
}

if ($op === 'sessions_revoke_others') {
    $keep = td_session_id_from_cookie();
    td_db()->prepare('DELETE FROM td_sessions WHERE id <> ?')->execute([$keep]);
    td_audit('sessions_revoked');
    td_json(['ok' => true]);
}

if ($op === 'audit') {
    $st = td_db()->query('SELECT ts, event, ua, detail FROM td_audit ORDER BY ts DESC LIMIT 50');
    td_json(['events' => $st->fetchAll()]);
}

td_json(['error' => 'bad_op'], 400);
