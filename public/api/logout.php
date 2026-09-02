<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

td_require_post();
td_config();
td_audit('logout');
td_destroy_session();
td_json(['ok' => true]);
