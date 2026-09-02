<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (!td_installed()) {
    td_json(['installed' => false, 'authenticated' => false]);
}
$cfg = td_config();
$s = td_https() ? td_current_session() : null;
td_json([
    'installed' => true,
    'authenticated' => $s !== null,
    'email' => $s ? $cfg['email'] : null,
    'totpEnabled' => !empty($cfg['totp_secret']),
    'encrypted' => td_crypto_available(),
    'https' => td_https(),
]);
