<?php

declare(strict_types=1);

namespace Essensplan\Ai;

/**
 * What the import needs from a recipe web page: the schema.org Recipe from
 * its JSON-LD (most recipe sites have one; it is far more reliable and much
 * shorter than the page text), else the visible text; plus a photo.
 */
final class RecipePage
{
    public const TEXT_MAX = 60000;
    private const LD_MAX = 40000;

    /** @param array<string, mixed>|null $recipe the reduced JSON-LD Recipe node */
    private function __construct(
        public readonly string $url,
        public readonly string $title,
        public readonly ?array $recipe,
        public readonly string $text,
        public readonly ?string $imageUrl,
    ) {
    }

    public static function parse(string $html, string $url, string $contentType = ''): self
    {
        $html = self::toUtf8($html, $contentType);
        $recipe = self::jsonLdRecipe($html);
        $title = '';
        if (preg_match('~<meta[^>]+property=["\']og:title["\'][^>]*content=["\']([^"\']*)~i', $html, $m)
            || preg_match('~<title[^>]*>(.*?)</title>~is', $html, $m)) {
            $title = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        }
        $image = $recipe !== null ? self::firstImage($recipe['image'] ?? null) : null;
        if ($image === null && (preg_match('~<meta[^>]+property=["\']og:image(?::secure_url)?["\'][^>]*content=["\']([^"\']+)~i', $html, $m)
            || preg_match('~<meta[^>]+content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']~i', $html, $m))) {
            $image = $m[1];
        }
        $image = $image !== null ? PageFetcher::absolute($image, $url) : null;
        if ($image !== null && !preg_match('~^https?://~i', $image)) {
            $image = null;
        }
        unset($recipe['image']);
        return new self($url, mb_substr($title, 0, 300), $recipe, $recipe === null ? self::text($html) : '', $image);
    }

    /** The input for the model: the structured data if there is some, else the page text. */
    public function forModel(): string
    {
        $head = "Adresse: $this->url\n" . ($this->title !== '' ? "Seitentitel: $this->title\n" : '');
        if ($this->recipe !== null) {
            $json = json_encode($this->recipe, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            return $head . "\nStrukturierte Rezeptdaten der Seite (schema.org/Recipe):\n" . mb_substr((string) $json, 0, self::LD_MAX);
        }
        return $head . "\nSeitentext:\n" . $this->text;
    }

    /** @return array<string, mixed>|null */
    private static function jsonLdRecipe(string $html): ?array
    {
        if (!preg_match_all('~<script[^>]+type=["\']?application/ld\+json["\']?[^>]*>(.*?)</script>~is', $html, $m)) {
            return null;
        }
        foreach ($m[1] as $raw) {
            $raw = trim(preg_replace('~^\s*<!\[CDATA\[|\]\]>\s*$~', '', $raw) ?? $raw);
            $data = json_decode($raw, true);
            if (!is_array($data)) {
                // Some sites put raw newlines and tabs inside strings.
                $data = json_decode((string) preg_replace('/[\x00-\x1F]+/', ' ', $raw), true);
            }
            if (is_array($data) && ($node = self::findRecipe($data)) !== null) {
                return self::reduce($node);
            }
        }
        return null;
    }

    private static function findRecipe(mixed $data, int $depth = 0): ?array
    {
        if (!is_array($data) || $depth > 6) {
            return null;
        }
        $type = $data['@type'] ?? null;
        $types = is_array($type) ? $type : [$type];
        if (in_array('Recipe', $types, true) || in_array('schema:Recipe', $types, true)) {
            return $data;
        }
        foreach (array_is_list($data) ? $data : [$data['@graph'] ?? null, $data['mainEntity'] ?? null, $data['mainEntityOfPage'] ?? null] as $child) {
            if (($found = self::findRecipe($child, $depth + 1)) !== null) {
                return $found;
            }
        }
        return null;
    }

    /** Keeps what describes the dish; flattens HowToSection/HowToStep into text. */
    private static function reduce(array $node): array
    {
        $keep = ['name', 'description', 'recipeYield', 'prepTime', 'cookTime', 'totalTime', 'recipeCategory', 'recipeCuisine', 'keywords', 'suitableForDiet', 'image', 'recipeIngredient', 'ingredients'];
        $out = array_intersect_key($node, array_flip($keep));
        $steps = [];
        $walk = function (mixed $item, string $section = '') use (&$walk, &$steps): void {
            if (is_string($item)) {
                foreach (preg_split('/\n+/', self::clean($item)) ?: [] as $line) {
                    if (trim($line) !== '') {
                        $steps[] = ($section !== '' ? "[$section] " : '') . trim($line);
                    }
                }
                return;
            }
            if (!is_array($item)) {
                return;
            }
            if (array_is_list($item)) {
                foreach ($item as $i) {
                    $walk($i, $section);
                }
                return;
            }
            $type = is_array($item['@type'] ?? null) ? implode(',', $item['@type']) : (string) ($item['@type'] ?? '');
            if (str_contains($type, 'HowToSection')) {
                $walk($item['itemListElement'] ?? [], self::clean((string) ($item['name'] ?? '')));
                return;
            }
            $walk((string) ($item['text'] ?? $item['name'] ?? $item['description'] ?? ''), $section);
        };
        $walk($node['recipeInstructions'] ?? []);
        if ($steps !== []) {
            $out['recipeInstructions'] = $steps;
        }
        foreach (['name', 'description'] as $k) {
            if (is_string($out[$k] ?? null)) {
                $out[$k] = self::clean($out[$k]);
            }
        }
        foreach (['recipeIngredient', 'ingredients'] as $k) {
            if (is_array($out[$k] ?? null)) {
                $out[$k] = array_values(array_map(fn ($i) => is_string($i) ? self::clean($i) : $i, $out[$k]));
            }
        }
        return $out;
    }

    private static function firstImage(mixed $img): ?string
    {
        if (is_string($img)) {
            return $img;
        }
        if (is_array($img)) {
            if (array_is_list($img)) {
                foreach ($img as $i) {
                    if (($u = self::firstImage($i)) !== null) {
                        return $u;
                    }
                }
                return null;
            }
            return self::firstImage($img['url'] ?? $img['contentUrl'] ?? null);
        }
        return null;
    }

    private static function clean(string $s): string
    {
        $s = html_entity_decode(strip_tags(str_ireplace(['<br>', '<br/>', '<br />', '</p>', '</li>'], "\n", $s)), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        return trim((string) preg_replace('/[ \t\x{00A0}]+/u', ' ', $s));
    }

    /** The visible text, as the old edge function did it (block tags → lines, tags dropped). */
    private static function text(string $html): string
    {
        $html = (string) preg_replace(['~<(script|style|noscript|svg|template)\b[^>]*>.*?</\1>~is', '~<!--.*?-->~s'], ' ', $html);
        if (preg_match('~<(main|article)\b[^>]*>(.*)</\1>~is', $html, $m) && strlen(strip_tags($m[2])) > 500) {
            $html = $m[2];
        }
        $html = (string) preg_replace('~</(p|div|li|h[1-6]|tr|section|article|ul|ol|table)>|<br\s*/?>~i', "\n", $html);
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim((string) preg_replace(["/[ \t\x{00A0}]+/u", "/\n\s*\n+/"], [' ', "\n"], $text));
        return mb_strlen($text) > self::TEXT_MAX ? mb_substr($text, 0, self::TEXT_MAX) . "\n…[gekürzt]" : $text;
    }

    private static function toUtf8(string $html, string $contentType): string
    {
        $charset = '';
        if (preg_match('/charset=["\']?([\w-]+)/i', $contentType, $m) || preg_match('~<meta[^>]+charset=["\']?([\w-]+)~i', substr($html, 0, 4096), $m)) {
            $charset = strtoupper($m[1]);
        }
        if ($charset !== '' && $charset !== 'UTF-8' && in_array($charset, array_map('strtoupper', mb_list_encodings()), true)) {
            return (string) mb_convert_encoding($html, 'UTF-8', $charset);
        }
        return mb_check_encoding($html, 'UTF-8') ? $html : (string) mb_convert_encoding($html, 'UTF-8', 'Windows-1252');
    }
}
