<?php

declare(strict_types=1);

// Recreates the test database once per run and applies the migrations.
// Uses TEST_DB_NAME (default essensplan_test), never DB_NAME.

use Essensplan\Console\Migrator;
use Essensplan\Db;
use Essensplan\Tests\TestCase;

require dirname(__DIR__) . '/vendor/autoload.php';

date_default_timezone_set('UTC');

$config = TestCase::config();
$name = $config->get('DB_NAME');
if (!preg_match('/test/', $name)) {
    fwrite(STDERR, "Refusing to run tests against $name: TEST_DB_NAME must contain 'test'.\n");
    exit(1);
}
$server = Db::connect($config, '');
$server->pdo()->exec("DROP DATABASE IF EXISTS `$name`");
$server->pdo()->exec("CREATE DATABASE `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
(new Migrator(Db::connect($config), dirname(__DIR__) . '/migrations'))->migrate();
