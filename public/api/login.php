<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
if (!td_https()) {
    td_json(['error' => 'https_required'], 400);
}
$cfg = td_config();
td_login_throttle();

$b = td_body();
$email = strtolower(trim((string) ($b['email'] ?? '')));
$pw = (string) ($b['password'] ?? '');
$code = (string) ($b['code'] ?? '');

$ok = hash_equals($cfg['email'], $email) && password_verify($pw, $cfg['password_hash']);
if (!$ok) {
    td_login_record(false);
    td_audit('login_fail', $email);
    usleep(random_int(400_000, 900_000));
    sleep(1);
    td_json(['error' => 'bad_credentials'], 401);
}
if (!empty($cfg['totp_secret'])) {
    if ($code === '') {
        td_json(['needCode' => true]);
    }
    if (!td_totp_verify($cfg['totp_secret'], $code)) {
        td_login_record(false);
        td_audit('login_fail_totp');
        sleep(1);
        td_json(['error' => 'bad_code'], 401);
    }
}
td_login_record(true);
td_create_session();
td_audit('login_ok');
td_json(['ok' => true, 'email' => $cfg['email'], 'totpEnabled' => !empty($cfg['totp_secret'])]);
