<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Config;
use PHPUnit\Framework\TestCase;

/** The server reads config.php (deploy.sh --push-config); locally .env stays. */
final class ConfigTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/essensplan-config-' . bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        foreach (['/.env', '/config.php'] as $f) {
            @unlink($this->dir . $f);
        }
        @rmdir($this->dir);
    }

    public function testConfigPhpWinsOverDotenvAndKeepsValuesLiteral(): void
    {
        file_put_contents($this->dir . '/.env', "APP_ENV=local\nESSENSPLAN_ONLY_IN_DOTENV=1\n");
        file_put_contents($this->dir . '/config.php', <<<'PHP'
            <?php return [
                'APP_ENV' => 'production',
                'DB_PASS' => 'pa ss # "$x\'',
                'DB_PORT' => 3306,
                'APP_DEBUG' => false,
                'MAIL_PASS' => null,
            ];
            PHP);

        $c = Config::load($this->dir);

        $this->assertSame('production', $c->get('APP_ENV'));
        $this->assertSame('pa ss # "$x\'', $c->get('DB_PASS'));
        $this->assertSame(3306, $c->int('DB_PORT', 0));
        $this->assertFalse($c->bool('APP_DEBUG', true));
        $this->assertSame('fallback', $c->get('MAIL_PASS', 'fallback'));
        $this->assertSame('', $c->get('ESSENSPLAN_ONLY_IN_DOTENV'), '.env is not read when config.php exists');
    }

    public function testConfigPhpMustReturnFlatArray(): void
    {
        file_put_contents($this->dir . '/config.php', "<?php return ['A' => ['nested']];");
        $this->expectException(\RuntimeException::class);
        Config::load($this->dir);
    }
}
