<?php
// Traveldays API – felles bibliotek. PHP 8.1+, ingen composer.
// Konfigurasjon og bilder ligger UTENFOR webroten: <hjem>/travels_private/
declare(strict_types=1);

const TD_COOKIE = 'td_s';
const TD_SESSION_DAYS = 30;
const TD_LOGIN_MAX_PER_IP = 8; // mislykkede forsøk per 15 min
const TD_LOGIN_MAX_GLOBAL = 40;
const TD_MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function td_private_dir(): string
{
    // __DIR__ = <webrot>/api  →  <hjem>/travels_private
    return dirname(__DIR__, 2) . '/travels_private';
}

function td_config_path(): string
{
    return td_private_dir() . '/config.php';
}

function td_installed(): bool
{
    return is_file(td_config_path());
}

/** @return array<string,mixed> */
function td_config(): array
{
    static $cfg = null;
    if ($cfg === null) {
        if (!td_installed()) {
            td_json(['error' => 'not_installed'], 503);
        }
        $cfg = require td_config_path();
    }
    return $cfg;
}

function td_db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = td_config()['db'];
        $pdo = new PDO(
            "mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4",
            $c['user'],
            $c['pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false],
        );
    }
    return $pdo;
}

/** Oppretter tabellene hvis de mangler (idempotent). */
function td_ensure_tables(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS td_sessions (
        id CHAR(64) PRIMARY KEY,
        created_at BIGINT NOT NULL,
        last_seen BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        ua_hash CHAR(64) NOT NULL,
        ip_hash CHAR(64) NOT NULL,
        INDEX (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS td_login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_hash CHAR(64) NOT NULL,
        ts BIGINT NOT NULL,
        ok TINYINT NOT NULL,
        INDEX (ts), INDEX (ip_hash, ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS td_segments (
        id CHAR(36) PRIMARY KEY,
        date CHAR(10) NOT NULL,
        data LONGTEXT NOT NULL,
        updated_at BIGINT NOT NULL,
        deleted TINYINT NOT NULL DEFAULT 0,
        INDEX (updated_at), INDEX (date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS td_images (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        mime VARCHAR(80) NOT NULL,
        width INT NOT NULL DEFAULT 0,
        height INT NOT NULL DEFAULT 0,
        size INT NOT NULL DEFAULT 0,
        raw_barcode TEXT NULL,
        ocr_text MEDIUMTEXT NULL,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        deleted TINYINT NOT NULL DEFAULT 0,
        INDEX (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS td_settings (
        id TINYINT PRIMARY KEY,
        data LONGTEXT NOT NULL,
        updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $pdo->exec('CREATE TABLE IF NOT EXISTS td_audit (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ts BIGINT NOT NULL,
        event VARCHAR(40) NOT NULL,
        ip_hash CHAR(64) NOT NULL,
        ua VARCHAR(255) NOT NULL,
        detail VARCHAR(255) NULL,
        INDEX (ts)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
}

/* ---------- HTTP-hjelpere ---------- */

function td_json(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** @return array<string,mixed> */
function td_body(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function td_now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}

function td_ip_hash(): string
{
    $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '';
    $ip = trim(explode(',', $ip)[0]);
    return hash_hmac('sha256', $ip, td_config()['secret']);
}

function td_ua_hash(): string
{
    return hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? '');
}

function td_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || ($_SERVER['SERVER_PORT'] ?? '') === '443';
}

/** Krever POST fra samme opprinnelse med egendefinert header (CSRF-vern). */
function td_require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        td_json(['error' => 'method'], 405);
    }
    if (($_SERVER['HTTP_X_TRAVELDAYS'] ?? '') !== '1') {
        td_json(['error' => 'csrf'], 403);
    }
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
    if ($origin !== '') {
        $oh = parse_url($origin, PHP_URL_HOST) ?: '';
        if (strcasecmp($oh, (string) parse_url('http://' . $host, PHP_URL_HOST)) !== 0) {
            td_json(['error' => 'origin'], 403);
        }
    }
}

function td_audit(string $event, ?string $detail = null): void
{
    try {
        $st = td_db()->prepare('INSERT INTO td_audit (ts, event, ip_hash, ua, detail) VALUES (?,?,?,?,?)');
        $st->execute([td_now_ms(), $event, td_ip_hash(), mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255), $detail]);
    } catch (Throwable) {
        // aldri la logging velte forespørselen
    }
}

/* ---------- Sesjoner ---------- */

function td_session_id_from_cookie(): ?string
{
    $t = $_COOKIE[TD_COOKIE] ?? '';
    if (!preg_match('/^[a-f0-9]{64}$/', $t)) {
        return null;
    }
    return hash('sha256', $t);
}

function td_set_cookie(string $token, int $expires): void
{
    setcookie(TD_COOKIE, $token, [
        'expires' => $expires,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function td_current_session(): ?array
{
    $id = td_session_id_from_cookie();
    if ($id === null) {
        return null;
    }
    $pdo = td_db();
    $st = $pdo->prepare('SELECT * FROM td_sessions WHERE id = ? AND expires_at > ?');
    $st->execute([$id, td_now_ms()]);
    $s = $st->fetch();
    if (!$s) {
        return null;
    }
    // Glidende utløp – oppdater maks én gang i timen
    if (td_now_ms() - (int) $s['last_seen'] > 3600_000) {
        $exp = td_now_ms() + TD_SESSION_DAYS * 86400_000;
        $pdo->prepare('UPDATE td_sessions SET last_seen = ?, expires_at = ? WHERE id = ?')->execute([td_now_ms(), $exp, $id]);
        td_set_cookie($_COOKIE[TD_COOKIE], intdiv($exp, 1000));
    }
    return $s;
}

function td_require_auth(): array
{
    if (!td_https()) {
        td_json(['error' => 'https_required'], 400);
    }
    $s = td_current_session();
    if ($s === null) {
        td_json(['error' => 'unauthenticated'], 401);
    }
    return $s;
}

function td_create_session(): void
{
    $token = bin2hex(random_bytes(32));
    $now = td_now_ms();
    $exp = $now + TD_SESSION_DAYS * 86400_000;
    td_db()->prepare('INSERT INTO td_sessions (id, created_at, last_seen, expires_at, ua_hash, ip_hash) VALUES (?,?,?,?,?,?)')
        ->execute([hash('sha256', $token), $now, $now, $exp, td_ua_hash(), td_ip_hash()]);
    // Rydd gamle
    td_db()->prepare('DELETE FROM td_sessions WHERE expires_at < ?')->execute([$now]);
    td_set_cookie($token, intdiv($exp, 1000));
}

function td_destroy_session(): void
{
    $id = td_session_id_from_cookie();
    if ($id !== null) {
        td_db()->prepare('DELETE FROM td_sessions WHERE id = ?')->execute([$id]);
    }
    td_set_cookie('', time() - 3600);
}

/* ---------- Innloggingsbegrensning ---------- */

function td_login_throttle(): void
{
    $pdo = td_db();
    $since = td_now_ms() - 15 * 60_000;
    $pdo->prepare('DELETE FROM td_login_attempts WHERE ts < ?')->execute([td_now_ms() - 86400_000]);
    $st = $pdo->prepare('SELECT COUNT(*) c FROM td_login_attempts WHERE ip_hash = ? AND ok = 0 AND ts > ?');
    $st->execute([td_ip_hash(), $since]);
    if ((int) $st->fetch()['c'] >= TD_LOGIN_MAX_PER_IP) {
        td_audit('login_throttled');
        td_json(['error' => 'too_many_attempts', 'retryMinutes' => 15], 429);
    }
    $st = $pdo->prepare('SELECT COUNT(*) c FROM td_login_attempts WHERE ok = 0 AND ts > ?');
    $st->execute([$since]);
    if ((int) $st->fetch()['c'] >= TD_LOGIN_MAX_GLOBAL) {
        td_json(['error' => 'too_many_attempts', 'retryMinutes' => 15], 429);
    }
}

function td_login_record(bool $ok): void
{
    td_db()->prepare('INSERT INTO td_login_attempts (ip_hash, ts, ok) VALUES (?,?,?)')->execute([td_ip_hash(), td_now_ms(), $ok ? 1 : 0]);
}

/* ---------- Passord ---------- */

function td_hash_password(string $pw): string
{
    if (defined('PASSWORD_ARGON2ID')) {
        return password_hash($pw, PASSWORD_ARGON2ID, ['memory_cost' => 65536, 'time_cost' => 4, 'threads' => 1]);
    }
    return password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]);
}

/* ---------- Konfig-skriving ---------- */

/** @param array<string,mixed> $cfg */
function td_write_config(array $cfg): void
{
    $dir = td_private_dir();
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0700, true)) {
            throw new RuntimeException("Kunne ikke opprette $dir");
        }
    }
    @chmod($dir, 0700);
    $php = "<?php\n// Traveldays – generert av setup.php. Hold denne filen hemmelig.\nreturn " . var_export($cfg, true) . ";\n";
    $tmp = $dir . '/config.php.tmp';
    if (file_put_contents($tmp, $php, LOCK_EX) === false) {
        throw new RuntimeException('Kunne ikke skrive config');
    }
    chmod($tmp, 0600);
    rename($tmp, td_config_path());
}

/* ---------- TOTP (RFC 6238) ---------- */

function td_base32_encode(string $bin): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $ch) {
        $bits .= str_pad(decbin(ord($ch)), 8, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 5) as $chunk) {
        $out .= $alphabet[bindec(str_pad($chunk, 5, '0'))];
    }
    return $out;
}

function td_base32_decode(string $b32): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $b32 = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $b32) ?? '');
    $bits = '';
    for ($i = 0, $n = strlen($b32); $i < $n; $i++) {
        $bits .= str_pad(decbin(strpos($alphabet, $b32[$i])), 5, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 8) as $chunk) {
        if (strlen($chunk) === 8) {
            $out .= chr(bindec($chunk));
        }
    }
    return $out;
}

function td_totp_code(string $secretB32, int $counter): string
{
    $key = td_base32_decode($secretB32);
    $msg = pack('N*', 0) . pack('N*', $counter);
    $h = hash_hmac('sha1', $msg, $key, true);
    $off = ord($h[19]) & 0x0f;
    $code = ((ord($h[$off]) & 0x7f) << 24) | (ord($h[$off + 1]) << 16) | (ord($h[$off + 2]) << 8) | ord($h[$off + 3]);
    return str_pad((string) ($code % 1_000_000), 6, '0', STR_PAD_LEFT);
}

function td_totp_verify(string $secretB32, string $code): bool
{
    $code = preg_replace('/\D/', '', $code) ?? '';
    if (strlen($code) !== 6) {
        return false;
    }
    $counter = intdiv(time(), 30);
    for ($w = -1; $w <= 1; $w++) {
        if (hash_equals(td_totp_code($secretB32, $counter + $w), $code)) {
            return true;
        }
    }
    return false;
}

/* ---------- Kryptering av filer (libsodium) ---------- */

function td_crypto_available(): bool
{
    return function_exists('sodium_crypto_secretbox');
}

function td_file_key(): string
{
    return hex2bin(td_config()['file_key']);
}

function td_encrypt_to_file(string $plain, string $path): void
{
    if (td_crypto_available()) {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $data = $nonce . sodium_crypto_secretbox($plain, $nonce, td_file_key());
    } else {
        $data = $plain;
    }
    if (file_put_contents($path, $data, LOCK_EX) === false) {
        throw new RuntimeException('Kunne ikke lagre fil');
    }
    chmod($path, 0600);
}

function td_decrypt_file(string $path): ?string
{
    $data = @file_get_contents($path);
    if ($data === false) {
        return null;
    }
    if (!td_crypto_available()) {
        return $data;
    }
    $n = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES;
    if (strlen($data) < $n) {
        return null;
    }
    $plain = sodium_crypto_secretbox_open(substr($data, $n), substr($data, 0, $n), td_file_key());
    return $plain === false ? null : $plain;
}

function td_image_path(string $id): string
{
    if (!preg_match('/^[a-f0-9-]{36}$/', $id)) {
        td_json(['error' => 'bad_id'], 400);
    }
    $dir = td_private_dir() . '/images';
    if (!is_dir($dir)) {
        mkdir($dir, 0700, true);
    }
    return $dir . '/' . $id . '.bin';
}

function td_valid_uuid(string $id): bool
{
    return (bool) preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/', $id);
}
