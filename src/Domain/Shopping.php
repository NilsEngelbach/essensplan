<?php

declare(strict_types=1);

namespace Essensplan\Domain;

/**
 * Grocery list logic, ported 1:1 from frontend/src/lib/shopping.ts and
 * formatAmount() in format.ts: supermarket sections, ingredient → section,
 * adding up the same ingredient across recipes. Pure functions.
 */
final class Shopping
{
    public const SECTIONS = [
        'Obst & Gemüse',
        'Brot & Backwaren',
        'Kühlung',
        'Fleisch & Fisch',
        'Tiefkühl',
        'Trockenware',
        'Konserven & Saucen',
        'Gewürze & Öl',
        'Süßes & Snacks',
        'Getränke',
        'Drogerie & Haushalt',
        'Sonstiges',
    ];

    // Checked in order: the specific multi-word cases come before the generic ones.
    private const RULES = [
        ['/tiefk|^tk[ -]/u', 'Tiefkühl'],
        ['/sojahack|linsen|couscous|haferflocken|reis$|^reis|spaghetti|makkaroni|nudel|lasagneplatten|mehl|grieß|backpulver|hefe|zucker|walnüss|nüsse|mandeln/u', 'Trockenware'],
        ['/kokosmilch|passierte|stückige|tomatenmark|brühe|sauce|soße|kichererbsen|bohnen|mais|sauerkirschen|currypaste|sirup|essig|senf|ketchup|dose|glas/u', 'Konserven & Saucen'],
        ['/pulver|salz|pfeffer|öl$|^öl|olivenöl|rapsöl|kreuzkümmel|majoran|muskat|oregano|zimt|curry|gewürz|vanille/u', 'Gewürze & Öl'],
        ['/hack|hähnchen|huhn|pute|rind|schwein|fleisch|fisch|lachs|thunfisch|garnelen/u', 'Fleisch & Fisch'],
        ['/käse|cheddar|emmentaler|gouda|feta|mozzarella|parmesan|milch|quark|sahne|schmand|butter|^eier|^ei$|joghurt|gnocchi|würstchen|speck|tofu/u', 'Kühlung'],
        ['/wraps|brot|brötchen|toast|tortilla|baguette/u', 'Brot & Backwaren'],
        ['/wein|bier|saft$|wasser|kaffee|tee$|limo/u', 'Getränke'],
        ['/schokolade|kekse|chips|gummi|süßigkeit/u', 'Süßes & Snacks'],
        ['/klopapier|toilettenpapier|spül|seife|zahnpasta|shampoo|waschmittel|müllbeutel|küchenrolle|schwamm/u', 'Drogerie & Haushalt'],
        ['/apfel|äpfel|aubergine|spinat|banane|blumenkohl|brokkoli|dill|zwiebel|gurke|ingwer|karotte|möhre|kartoffel|tomate|knoblauch|koriander|limette|zitrone|paprika|petersilie|rosmarin|thymian|basilikum|suppengrün|zucchini|salat|lauch|pilz|champignon|kürbis|beeren|obst|gemüse|avocado|sellerie/u', 'Obst & Gemüse'],
    ];

    /** Things nobody buys. */
    private const SKIP = ['wasser', 'leitungswasser'];

    private const COUNT_UNITS = ['', 'stk', 'stück', 'el', 'tl', 'prise', 'prisen', 'bund', 'zehe', 'zehen', 'dose', 'dosen', 'pck', 'päckchen', 'scheibe', 'scheiben', 'becher'];

    private const FRACTIONS = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

    /** "Paprika, rot" and "Paprika, gelb" are one thing to buy: Paprika. */
    public static function baseName(string $name): string
    {
        return trim(explode(',', $name)[0]);
    }

    public static function nameKey(string $name): string
    {
        return mb_strtolower(self::baseName($name), 'UTF-8');
    }

    /** Word-list classification; the AI fallback for unknown names comes in Phase 6. */
    public static function classify(string $name): string
    {
        $k = self::nameKey($name);
        foreach (self::RULES as [$re, $section]) {
            if (preg_match($re, $k)) {
                return $section;
            }
        }
        return 'Sonstiges';
    }

    /** German number format without thousands separators below 10 000, like toLocaleString('de-DE'). */
    public static function de(float $v): string
    {
        $s = rtrim(rtrim(number_format($v, 3, ',', ''), '0'), ',');
        $int = explode(',', $s)[0];
        $neg = str_starts_with($int, '-');
        $digits = ltrim($int, '-');
        if (strlen($digits) > 3) {
            // de-DE groups from 1.000 on (Intl default useGrouping: auto → "1.000").
            $digits = strrev(implode('.', str_split(strrev($digits), 3)));
        }
        $frac = str_contains($s, ',') ? ',' . explode(',', $s)[1] : '';
        return ($neg ? '-' : '') . $digits . $frac;
    }

    /** Scales an amount and formats it the way a German recipe would print it. */
    public static function formatAmount(?float $amount, ?string $unit, float $factor = 1): string
    {
        if ($amount === null || $amount == 0) {
            return '';
        }
        $v = $amount * $factor;
        $u = mb_strtolower(trim($unit ?? ''), 'UTF-8');
        if (in_array($u, self::COUNT_UNITS, true)) {
            // A pinch stays a pinch; everything else counted snaps to quarters.
            if ($u === 'prise' || $u === 'prisen') {
                return (string) max(1, self::jsRound($v));
            }
            $snapped = max(0.25, self::jsRound($v * 4) / 4);
            $whole = (int) floor($snapped + 1e-9);
            $rest = $snapped - $whole;
            if ($rest == 0) {
                return (string) $whole;
            }
            foreach (self::FRACTIONS as [$f, $glyph]) {
                if (abs($rest - $f) < 0.01) {
                    return $whole > 0 ? $whole . $glyph : $glyph;
                }
            }
            return self::de($snapped);
        }
        // Weights and volumes: sensible kitchen precision.
        if ($v >= 500) {
            $rounded = self::jsRound($v / 10) * 10;
        } elseif ($v >= 50) {
            $rounded = self::jsRound($v / 5) * 5;
        } elseif ($v >= 10) {
            $rounded = self::jsRound($v);
        } else {
            $rounded = self::jsRound($v * 10) / 10;
        }
        return self::de((float) $rounded);
    }

    /** Math.round: halves go up (towards +∞), unlike PHP's round(). */
    private static function jsRound(float $v): int
    {
        return (int) floor($v + 0.5);
    }

    /** @return array{kind: string, label: string} */
    private static function family(?string $unit): array
    {
        $u = trim($unit ?? '');
        $l = mb_strtolower($u, 'UTF-8');
        return match (true) {
            $l === 'g' || $l === 'kg' => ['kind' => 'mass', 'label' => 'g'],
            $l === 'ml' || $l === 'l' => ['kind' => 'volume', 'label' => 'ml'],
            $l === 'zehe' || $l === 'zehen' => ['kind' => 'count', 'label' => 'Zehen'],
            $l === 'prise' || $l === 'prisen' => ['kind' => 'count', 'label' => 'Prise'],
            default => ['kind' => 'count', 'label' => $u],
        };
    }

    private static function toBase(float $amount, ?string $unit): float
    {
        $l = mb_strtolower(trim($unit ?? ''), 'UTF-8');
        return $l === 'kg' || $l === 'l' ? $amount * 1000 : $amount;
    }

    /** @param array{kind: string, label: string} $f */
    private static function formatPart(array $f, float $v): string
    {
        if ($f['kind'] === 'mass') {
            return $v >= 1000 ? self::de(self::jsRound($v / 100) / 10) . ' kg' : self::formatAmount($v, 'g') . ' g';
        }
        if ($f['kind'] === 'volume') {
            return $v >= 1000 ? self::de(self::jsRound($v / 100) / 10) . ' l' : self::formatAmount($v, 'ml') . ' ml';
        }
        $n = self::formatAmount($v, $f['label'] === '' ? null : $f['label']);
        // "1 Zehe", "3 Zehen"
        $label = $f['label'] === 'Zehen' && $v <= 1 ? 'Zehe' : $f['label'];
        return $label !== '' ? "$n $label" : $n;
    }

    /**
     * Adds up the ingredients of all planned recipes by base name and unit family.
     *
     * @param iterable<array{name: string, amount: float|int|string|null, unit: ?string, section?: ?string}> $ingredients
     * @return list<array{key: string, name: string, qty: string, section: ?string}>
     */
    public static function aggregate(iterable $ingredients): array
    {
        /** @var array<string, array{name: string, section: ?string, parts: array<string, array{f: array, v: float}>}> $groups */
        $groups = [];
        foreach ($ingredients as $ing) {
            $key = self::nameKey($ing['name']);
            if ($key === '' || in_array($key, self::SKIP, true)) {
                continue;
            }
            $groups[$key] ??= ['name' => self::baseName($ing['name']), 'section' => $ing['section'] ?? null, 'parts' => []];
            $amount = $ing['amount'] === null ? null : (float) $ing['amount'];
            if ($amount === null || $amount == 0) {
                continue;
            }
            $f = self::family($ing['unit']);
            $id = $f['kind'] . ':' . $f['label'];
            $groups[$key]['parts'][$id] ??= ['f' => $f, 'v' => 0.0];
            $groups[$key]['parts'][$id]['v'] += self::toBase($amount, $ing['unit']);
        }
        // "Zwiebel" and "Zwiebeln" are one line: plural keys fold into their singular.
        foreach (array_keys($groups) as $key) {
            $key = (string) $key;
            $single = null;
            foreach ([mb_substr($key, 0, -1), mb_substr($key, 0, -2)] as $k) {
                if (mb_strlen($k) > 2 && $k !== $key && isset($groups[$k]) && (str_ends_with($key, 'n') || str_ends_with($key, 'en'))) {
                    $single = $k;
                    break;
                }
            }
            if ($single === null) {
                continue;
            }
            foreach ($groups[$key]['parts'] as $id => $p) {
                $groups[$single]['parts'][$id] ??= ['f' => $p['f'], 'v' => 0.0];
                $groups[$single]['parts'][$id]['v'] += $p['v'];
            }
            $groups[$single]['name'] = $groups[$key]['name']; // the plural reads right on a shopping list
            $groups[$single]['section'] ??= $groups[$key]['section'];
            unset($groups[$key]);
        }
        $out = [];
        foreach ($groups as $key => $g) {
            $out[] = [
                'key' => (string) $key,
                'name' => $g['name'],
                'qty' => implode(' + ', array_map(fn ($p) => self::formatPart($p['f'], $p['v']), array_values($g['parts']))),
                'section' => $g['section'],
            ];
        }
        return $out;
    }
}
