<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Domain\Catalog;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Service\RecipeService;
use Essensplan\Util;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class RecipeController
{
    public function __construct(private readonly RecipeService $recipes)
    {
    }

    /** Query string → validated filters (shared with MCP search_recipes). */
    public static function query(array $q): array
    {
        $out = [];
        $int = function (string $k, int $min, int $max) use ($q, &$out) {
            if (!isset($q[$k]) || $q[$k] === '') {
                return;
            }
            if (!is_numeric($q[$k]) || (int) $q[$k] < $min || (int) $q[$k] > $max) {
                throw ApiError::field($k, "$k muss eine Zahl von $min bis $max sein.");
            }
            $out[$k] = (int) $q[$k];
        };
        if (isset($q['q']) && trim((string) $q['q']) !== '') {
            $out['q'] = mb_substr(trim((string) $q['q']), 0, 100);
        }
        if (!empty($q['category'])) {
            if (!in_array($q['category'], Catalog::CATEGORIES, true)) {
                throw ApiError::field('category', 'Diese Kategorie gibt es nicht.');
            }
            $out['category'] = $q['category'];
        }
        $tags = $q['tags'] ?? [];
        $tags = is_array($tags) ? $tags : array_filter(explode(',', (string) $tags));
        foreach ($tags as $t) {
            if (!in_array($t, Catalog::TAGS, true)) {
                throw ApiError::field('tags', "Das Merkmal $t gibt es nicht.");
            }
        }
        $out['tags'] = array_values($tags);
        $int('maxTime', 1, 1440);
        $int('minRating', 1, 5);
        $int('limit', 1, 200);
        if (!empty($q['notCookedSince'])) {
            if (!Util::isDate($q['notCookedSince'])) {
                throw ApiError::field('notCookedSince', 'notCookedSince als YYYY-MM-DD.');
            }
            $out['notCookedSince'] = $q['notCookedSince'];
        }
        foreach (['favourites', 'quick'] as $flag) {
            if (isset($q[$flag])) {
                $out[$flag] = filter_var($q[$flag], FILTER_VALIDATE_BOOLEAN);
            }
        }
        if (isset($q['sort'])) {
            if (!in_array($q['sort'], ['loved', 'title', 'lastCooked', 'newest', 'time'], true)) {
                throw ApiError::field('sort', 'sort ist loved, title, lastCooked, newest oder time.');
            }
            $out['sort'] = $q['sort'];
        }
        if (!empty($q['cursor'])) {
            $out['cursor'] = (string) $q['cursor'];
        }
        return $out;
    }

    public function list(Request $req, Response $res): Response
    {
        return Io::json($res, $this->recipes->list(Io::principal($req), self::query($req->getQueryParams())));
    }

    public function get(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->recipes->get(Io::principal($req), Io::arg($args, 'id')));
    }

    public function create(Request $req, Response $res): Response
    {
        return Io::json($res, $this->recipes->create(Io::principal($req), Io::body($req, 'recipe')), 201);
    }

    public function replace(Request $req, Response $res, array $args): Response
    {
        $draft = Io::body($req, 'recipe');
        $draft += ['ingredients' => [], 'instructions' => []];
        return Io::json($res, $this->recipes->update(Io::principal($req), Io::arg($args, 'id'), $draft, false));
    }

    public function patch(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->recipes->update(Io::principal($req), Io::arg($args, 'id'), Io::body($req, 'recipe-patch'), true));
    }

    public function delete(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->recipes->delete(Io::principal($req), Io::arg($args, 'id')));
    }

    public function restore(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->recipes->restore(Io::principal($req), Io::arg($args, 'id')));
    }
}
