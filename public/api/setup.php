<?php
// Engangs-installasjon. Låser seg selv når config finnes.
declare(strict_types=1);
require __DIR__ . '/lib.php';

header('X-Robots-Tag: noindex, nofollow');
header('Content-Type: text/html; charset=utf-8');

if (td_installed()) {
    http_response_code(403);
    echo '<!doctype html><meta charset="utf-8"><title>Traveldays</title><p style="font-family:system-ui;padding:2rem">Traveldays er allerede installert. Slett <code>travels_private/config.php</code> på serveren for å kjøre oppsettet på nytt.</p>';
    exit;
}
if (!td_https()) {
    http_response_code(400);
    echo '<p>Oppsettet krever HTTPS.</p>';
    exit;
}

$errors = [];
$v = fn(string $k): string => trim((string) ($_POST[$k] ?? ''));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $host = $v('db_host');
    $name = $v('db_name');
    $user = $v('db_user');
    $pass = (string) ($_POST['db_pass'] ?? '');
    $email = strtolower($v('email'));
    $pw1 = (string) ($_POST['pw1'] ?? '');
    $pw2 = (string) ($_POST['pw2'] ?? '');

    if ($host === '' || $name === '' || $user === '') {
        $errors[] = 'Fyll inn databaseopplysningene.';
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Ugyldig e-postadresse.';
    }
    if (strlen($pw1) < 12) {
        $errors[] = 'Passordet må ha minst 12 tegn.';
    }
    if ($pw1 !== $pw2) {
        $errors[] = 'Passordene er ikke like.';
    }
    if (!$errors) {
        try {
            $pdo = new PDO("mysql:host=$host;dbname=$name;charset=utf8mb4", $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
            td_ensure_tables($pdo);
            $cfg = [
                'db' => ['host' => $host, 'name' => $name, 'user' => $user, 'pass' => $pass],
                'email' => $email,
                'password_hash' => td_hash_password($pw1),
                'secret' => bin2hex(random_bytes(32)),
                'file_key' => bin2hex(random_bytes(32)),
                'totp_secret' => null,
                'created' => gmdate('c'),
            ];
            td_write_config($cfg);
            @mkdir(td_private_dir() . '/images', 0700, true);
            echo '<!doctype html><meta charset="utf-8"><title>Traveldays</title><div style="font-family:system-ui;padding:2rem;max-width:40rem"><h1>Ferdig</h1><p>Databasen er satt opp og konfigurasjonen er skrevet til <code>travels_private/config.php</code> (utenfor webroten, chmod 600).</p><p>Filkryptering: <strong>' . (td_crypto_available() ? 'libsodium aktiv – boardingkort krypteres på disk' : 'libsodium mangler – filer lagres ukryptert (fortsatt utenfor webroten)') . '</strong>.</p><p>Passordhash: <strong>' . (defined('PASSWORD_ARGON2ID') ? 'Argon2id' : 'bcrypt') . '</strong>.</p><p><a href="/">Gå til appen og logg inn</a>. Aktiver tofaktor under Innstillinger → Sikkerhet.</p></div>';
            exit;
        } catch (Throwable $e) {
            $errors[] = 'Feil: ' . htmlspecialchars($e->getMessage());
        }
    }
}
?>
<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Traveldays – oppsett</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;background:#f6f1e7;color:#1c1c1c;margin:0;padding:2rem 1rem}
  main{max-width:34rem;margin:0 auto;background:#fff;border-radius:14px;padding:1.5rem;box-shadow:0 8px 24px rgba(15,27,45,.08)}
  h1{font-family:Georgia,serif;font-weight:500;margin:0 0 .5rem}
  label{display:block;font-size:.85rem;color:#666;margin-top:.9rem}
  input{width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid #e3dbcb;border-radius:10px;font:inherit;margin-top:.25rem}
  button{margin-top:1.2rem;background:#0f1b2d;color:#f6f1e7;border:0;padding:.7rem 1.2rem;border-radius:10px;font:inherit;cursor:pointer}
  .err{background:#fae3e1;color:#b3261e;padding:.6rem .8rem;border-radius:10px;margin-top:1rem}
  .hint{font-size:.8rem;color:#777}
</style>
</head>
<body>
<main>
  <h1>Traveldays – oppsett</h1>
  <p class="hint">Kjøres én gang. Databasepassordet skrives til en fil utenfor webroten og sendes aldri videre.</p>
  <?php foreach ($errors as $e): ?><div class="err"><?= $e ?></div><?php endforeach; ?>
  <form method="post" autocomplete="off">
    <label>MySQL-server <input name="db_host" required value="<?= htmlspecialchars($v('db_host')) ?>" placeholder="mollanolafsenf03.mysql.domeneshop.no"></label>
    <label>Databasenavn <input name="db_name" required value="<?= htmlspecialchars($v('db_name')) ?>" placeholder="mollanolafsenf03"></label>
    <label>Databasebruker <input name="db_user" required value="<?= htmlspecialchars($v('db_user')) ?>" placeholder="mollanolafsenf03"></label>
    <label>Databasepassord <input name="db_pass" type="password" required></label>
    <label>Din e-post (brukernavn i appen) <input name="email" type="email" required value="<?= htmlspecialchars($v('email')) ?>"></label>
    <label>Passord til appen (minst 12 tegn) <input name="pw1" type="password" required minlength="12"></label>
    <label>Gjenta passord <input name="pw2" type="password" required minlength="12"></label>
    <button type="submit">Installer</button>
  </form>
</main>
</body>
</html>
