<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Import\ImportSource;
use Essensplan\Import\SupabaseImporter;
use Essensplan\Service\MediaStore;

final class SupabaseImportTest extends TestCase
{
    private const UID = '6f1c2b3a-1111-4c2d-9e8f-000000000001';
    private const OLD_HASH = '$2a$10$abcdefghijklmnopqrstuuJ0vY6m3tQ8bX1n0s1K2Wq3Yv4Zr5s6O';

    private string $dir;
    /** @var list<string> */
    private array $fetched = [];

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/esp-import-' . bin2hex(random_bytes(4));
        $this->boot(['MEDIA_DIR' => $this->dir]);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*/*') ?: [] as $f) {
            unlink($f);
        }
        foreach (glob($this->dir . '/*') ?: [] as $d) {
            rmdir($d);
        }
        @rmdir($this->dir);
    }

    private function importer(): SupabaseImporter
    {
        return new SupabaseImporter($this->c->get(Db::class), $this->c->get(MediaStore::class), $this->c->get(Clock::class), function (string $url): ?string {
            $this->fetched[] = $url;
            if (str_contains($url, 'kaputt')) {
                return null;
            }
            $img = imagecreatetruecolor(1200, 800);
            ob_start();
            imagejpeg($img);
            return (string) ob_get_clean();
        });
    }

    private static function source(array $over = []): ImportSource
    {
        $epoch = fn (string $utc) => (float) (new \DateTimeImmutable($utc, new \DateTimeZone('UTC')))->format('U.u');
        $data = [
            'users' => [[
                'id' => self::UID, 'email' => 'Nils@Example.org', 'password_hash' => self::OLD_HASH, 'name' => null,
                'created_at' => $epoch('2024-03-01 10:00:00'), 'email_confirmed_at' => $epoch('2024-03-01 10:05:00'),
            ]],
            'recipes' => [
                [
                    'id' => 'clr1lasagne', 'title' => '  Lasagne ', 'description' => '', 'imageUrl' => 'https://x.supabase.co/storage/v1/object/public/recipe-images/users/a/1.jpg',
                    'category' => 'hauptspeise', 'tags' => '["vegetarisch","cookidoo","Schnell","Lieblingsessen"]', 'cookingTime' => 0, 'servings' => 4,
                    'difficulty' => 'einfach', 'rating' => 7, 'sourceUrl' => 'https://cookidoo.de/r/1',
                    'createdAt' => $epoch('2024-04-01 12:00:00'), 'updatedAt' => $epoch('2024-05-01 12:00:00.123456'),
                    'ingredients' => [
                        ['id' => 'i1', 'name' => 'Lasagneplatten', 'amount' => 250.0, 'unit' => 'g', 'notes' => null, 'component' => null],
                        ['id' => 'i2', 'name' => 'Zwiebel', 'amount' => 1.0, 'unit' => '', 'notes' => 'fein', 'component' => 'Soße'],
                        ['id' => 'i3', 'name' => '   ', 'amount' => null, 'unit' => null, 'notes' => null, 'component' => null],
                    ],
                    'instructions' => [
                        ['id' => 's2', 'stepNumber' => 3, 'description' => 'Schichten und backen.', 'imageUrl' => null],
                        ['id' => 's1', 'stepNumber' => 1, 'description' => 'Soße kochen.', 'imageUrl' => 'https://kaputt.example/2.jpg'],
                    ],
                ],
                [
                    'id' => 'clr2salat', 'title' => 'Salat', 'description' => 'Frisch', 'imageUrl' => null,
                    'category' => 'Vorspeise', 'tags' => '', 'cookingTime' => 15, 'servings' => null, 'difficulty' => null, 'rating' => null, 'sourceUrl' => null,
                    'createdAt' => $epoch('2024-04-02 12:00:00'), 'updatedAt' => $epoch('2024-04-02 12:00:00'),
                    'ingredients' => [], 'instructions' => [],
                ],
            ],
            'plans' => [
                ['id' => 'mp1', 'date' => $epoch('2026-11-02 00:00:00'), 'recipeId' => 'clr1lasagne', 'createdAt' => $epoch('2026-11-01 08:00:00'), 'updatedAt' => $epoch('2026-11-01 08:00:00')],
                // Written as Berlin midnight by some client: still Tuesday in Berlin.
                ['id' => 'mp2', 'date' => $epoch('2026-11-02 23:00:00'), 'recipeId' => 'clr2salat', 'createdAt' => $epoch('2026-11-01 08:00:00'), 'updatedAt' => $epoch('2026-11-01 08:00:00')],
                ['id' => 'mp3', 'date' => $epoch('2026-11-04 00:00:00'), 'recipeId' => null, 'createdAt' => $epoch('2026-11-01 08:00:00'), 'updatedAt' => $epoch('2026-11-01 08:00:00')],
            ],
            ...$over,
        ];
        return new class ($data) implements ImportSource {
            public function __construct(private array $d)
            {
            }

            public function users(): array
            {
                return $this->d['users'];
            }

            public function recipes(string $userId): array
            {
                return $this->d['recipes'];
            }

            public function mealPlans(string $userId): array
            {
                return $this->d['plans'];
            }
        };
    }

    public function testImportsAFamilyWithCleanedValuesPhotosAndLunchEntries(): void
    {
        $lines = [];
        $report = $this->importer()->run(self::source(), [], function (string $s) use (&$lines) {
            $lines[] = $s;
        })['nils@example.org'];

        $user = $this->db->one('SELECT * FROM users WHERE id = ?', [self::UID]);
        $this->assertSame('nils@example.org', $user['email']);
        $this->assertSame(self::OLD_HASH, $user['password_hash']);
        $this->assertSame('Familie', $user['name']);
        $this->assertSame('2024-03-01 10:05:00', $user['email_verified_at']);

        $this->assertSame([2, 2, 2, 2, 1], [$report['recipes'], $report['ingredients'], $report['steps'], $report['entries'], $report['photos']]);
        $this->assertSame(['Lieblingsessen' => 1], $report['droppedTags']);
        $this->assertSame(['Vorspeise' => 1], $report['fixedCategories']);
        $this->assertSame(1, $report['skippedEntries']);
        $this->assertSame(1, $report['movedDays']);
        $this->assertCount(1, $report['photoFailures']);
        $this->assertStringContainsString('tag „Lieblingsessen“ dropped', $lines[0]);

        $l = $this->db->one('SELECT * FROM recipes WHERE id = ?', ['clr1lasagne']);
        $this->assertSame(['Lasagne', null, 'Hauptspeise', ['Vegetarisch', 'Cookidoo', 'Schnell'], null, 4, 'Einfach', null, 'import'], [
            $l['title'], $l['description'], $l['category'], json_decode($l['tags'], true), $l['cooking_time'] === null ? null : (int) $l['cooking_time'],
            (int) $l['servings'], $l['difficulty'], $l['rating'], $l['created_via'],
        ]);
        $this->assertSame('2024-05-01 12:00:00.123456', $l['updated_at']);
        $this->assertMatchesRegularExpression('~^/media/' . self::UID . '/[0-9a-f]{24}\.jpg$~', $l['image_path']);
        $this->assertFileExists($this->dir . substr($l['image_path'], 6));

        $ing = $this->db->all('SELECT name, amount, unit, notes, component, section FROM ingredients WHERE recipe_id = ? ORDER BY position', ['clr1lasagne']);
        $this->assertSame(['Lasagneplatten', 'Zwiebel'], array_column($ing, 'name'));
        $this->assertNull($ing[1]['unit']);
        $this->assertSame(['fein', 'Soße'], [$ing[1]['notes'], $ing[1]['component']]);
        $this->assertNotNull($ing[1]['section']);
        $steps = $this->db->all('SELECT step_number, description, image_path FROM instructions WHERE recipe_id = ? ORDER BY step_number', ['clr1lasagne']);
        $this->assertSame([1, 2], array_map('intval', array_column($steps, 'step_number')));
        $this->assertSame('Soße kochen.', $steps[0]['description']);
        $this->assertSame('https://kaputt.example/2.jpg', $steps[0]['image_path'], 'a failed download stays a link');

        $entries = $this->db->all('SELECT id, date, meal_slot_id, recipe_id, position FROM meal_plan_entries WHERE user_id = ? ORDER BY id', [self::UID]);
        $this->assertSame([
            ['id' => 'mp1', 'date' => '2026-11-02', 'meal_slot_id' => 2, 'recipe_id' => 'clr1lasagne', 'position' => 0],
            ['id' => 'mp2', 'date' => '2026-11-03', 'meal_slot_id' => 2, 'recipe_id' => 'clr2salat', 'position' => 0],
        ], array_map(fn ($e) => [...$e, 'meal_slot_id' => (int) $e['meal_slot_id'], 'position' => (int) $e['position']], $entries));

        // The old password logs in (and is rehashed), and the API serves the imported data.
        $hash = password_hash(self::PASSWORD, PASSWORD_BCRYPT);
        $this->db->exec('UPDATE users SET password_hash = ? WHERE id = ?', ['$2a$' . substr($hash, 4), self::UID]);
        $me = $this->login('nils@example.org');
        $this->assertStringStartsWith('$2y$', (string) $this->db->value('SELECT password_hash FROM users WHERE id = ?', [self::UID]));
        $recipe = $this->ok(200, 'GET', '/api/v1/recipes/clr1lasagne', null, $me);
        $this->assertSame(1, $recipe['cookingStats']['timesCooked']);
        $this->assertSame('2026-11-02', $recipe['cookingStats']['lastCooked']);
    }

    public function testSkipsFamiliesWithDataUnlessReplaceAndNeverTouchesAnotherAccount(): void
    {
        $out = fn () => null;
        $this->importer()->run(self::source(), [], $out);
        $again = $this->importer()->run(self::source(), [], $out)['nils@example.org'];
        $this->assertStringStartsWith('skipped: already has data', $again['status']);

        // --replace wipes the imported content but keeps devices.
        $this->db->exec('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash(self::PASSWORD, PASSWORD_DEFAULT), self::UID]);
        $me = $this->login('nils@example.org');
        $this->db->exec("UPDATE recipes SET title = 'Geändert' WHERE id = 'clr1lasagne'");
        $this->db->exec("INSERT INTO shopping_manual_items (id, user_id, name, section, created_via, created_at) VALUES ('m1', ?, 'Kaffee', 'Sonstiges', 'app', NOW())", [self::UID]);
        $r = $this->importer()->run(self::source(), ['replace' => true], $out)['nils@example.org'];
        $this->assertSame('imported again (--replace)', $r['status']);
        $this->assertSame('Lasagne', $this->db->value("SELECT title FROM recipes WHERE id = 'clr1lasagne'"));
        $this->assertSame(0, (int) $this->db->value('SELECT COUNT(*) FROM shopping_manual_items WHERE user_id = ?', [self::UID]));
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM sessions WHERE user_id = ?', [self::UID]));

        // The same e-mail on a different local account: left alone.
        $this->db->exec('SET FOREIGN_KEY_CHECKS = 0');
        $this->db->exec('DELETE FROM users WHERE id = ?', [self::UID]);
        $this->db->exec('SET FOREIGN_KEY_CHECKS = 1');
        $this->user('nils@example.org');
        $r = $this->importer()->run(self::source(), [], $out)['nils@example.org'];
        $this->assertStringStartsWith('skipped: the e-mail belongs to another account', $r['status']);
        $this->assertNotNull($me);
    }

    public function testOnlyTheChosenFamilyAndNoDownloadsWithoutImages(): void
    {
        $users = [
            ['id' => self::UID, 'email' => 'nils@example.org', 'password_hash' => null, 'name' => 'Engelbachs', 'created_at' => 1.7e9, 'email_confirmed_at' => null],
            ['id' => '6f1c2b3a-1111-4c2d-9e8f-000000000002', 'email' => 'other@example.org', 'password_hash' => self::OLD_HASH, 'name' => null, 'created_at' => 1.7e9, 'email_confirmed_at' => null],
        ];
        $r = $this->importer()->run(self::source(['users' => $users]), ['email' => 'NILS@example.org', 'images' => false], fn () => null);
        $this->assertSame(['nils@example.org'], array_keys($r));
        $this->assertTrue($r['nils@example.org']['noPassword']);
        $this->assertSame(2, $r['nils@example.org']['photoLinksKept']);
        $this->assertSame([], $this->fetched);
        $this->assertSame('Engelbachs', $this->db->value('SELECT name FROM users WHERE id = ?', [self::UID]));
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM users'));
        $this->assertStringStartsWith('https://x.supabase.co/', (string) $this->db->value("SELECT image_path FROM recipes WHERE id = 'clr1lasagne'"));
    }
}
