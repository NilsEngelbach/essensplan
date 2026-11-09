<?php

declare(strict_types=1);

namespace Essensplan\Http;

use Essensplan\Http\Controller\AccountController as Account;
use Essensplan\Http\Controller\AgentController as Agent;
use Essensplan\Http\Controller\AiController as Ai;
use Essensplan\Http\Controller\ImageController as Image;
use Essensplan\Http\Controller\PlanController as Plan;
use Essensplan\Http\Controller\RecipeController as Recipe;
use Essensplan\Http\Controller\ShoppingController as Shop;
use Essensplan\Http\Controller\SystemController as System;

/**
 * The REST route table under /api/v1: one place for path, handler, who may
 * call it and the body schema. Authenticate/RequireScope read it, and so
 * does the OpenAPI generator.
 *
 * auth: 'public' · 'guest' (session-only, may be logged out) · 'session' ·
 *       'profile' (session or any key) · a scope (session or a key with it)
 */
final class Routes
{
    /** @return list<array{0: string, 1: string, 2: array{class-string, string}, 3: string, 4: ?string, 5: string}> */
    public static function all(): array
    {
        return [
            ['GET', '/health', [System::class, 'health'], 'public', null, 'Is the app up?'],
            ['GET', '/config', [System::class, 'config'], 'public', null, 'Fixed sets and switches for the SPA'],
            ['GET', '/openapi.json', [System::class, 'openapi'], 'public', null, 'This document'],

            ['POST', '/auth/login', [Account::class, 'login'], 'guest', 'login', 'Log in with e-mail and password'],
            ['POST', '/auth/logout', [Account::class, 'logout'], 'session', null, 'Log this device out'],
            ['POST', '/auth/pair', [Account::class, 'pair'], 'guest', 'pair', 'Log a new device in with a code or QR token'],
            ['POST', '/auth/device-links', [Account::class, 'createLink'], 'session', null, 'Show a pairing code and QR token (10 min)'],
            ['GET', '/auth/device-links/{id}', [Account::class, 'getLink'], 'session', null, 'Poll a pairing link'],
            ['DELETE', '/auth/device-links/{id}', [Account::class, 'deleteLink'], 'session', null, 'Cancel a pairing link'],
            ['GET', '/auth/sessions', [Account::class, 'sessions'], 'session', null, 'Logged-in devices'],
            ['DELETE', '/auth/sessions/{id}', [Account::class, 'revokeSession'], 'session', null, 'Log one device out'],
            ['POST', '/auth/sessions/revoke-others', [Account::class, 'revokeOthers'], 'session', null, 'Log all other devices out'],
            ['POST', '/auth/forgot-password', [Account::class, 'forgot'], 'guest', 'forgot', 'Mail a reset link (always 204)'],
            ['POST', '/auth/reset-password/check', [Account::class, 'checkReset'], 'guest', 'reset-check', 'Is this reset or invite link still valid? → {purpose}'],
            ['POST', '/auth/reset-password', [Account::class, 'reset'], 'guest', 'reset', 'Set the password from the mailed reset or invite link'],
            ['GET', '/me', [Account::class, 'me'], 'profile', null, 'Account, settings, today and the default week'],
            ['PATCH', '/me', [Account::class, 'updateMe'], 'session', 'me-patch', 'Name, e-mail (needs the password) and settings'],

            ['GET', '/recipes', [Recipe::class, 'list'], 'recipes:read', null, 'Search and filter recipes'],
            ['POST', '/recipes', [Recipe::class, 'create'], 'recipes:write', 'recipe', 'Create a recipe'],
            ['GET', '/recipes/{id}', [Recipe::class, 'get'], 'recipes:read', null, 'One recipe with ingredients and steps'],
            ['PUT', '/recipes/{id}', [Recipe::class, 'replace'], 'recipes:write', 'recipe', 'Replace a recipe'],
            ['PATCH', '/recipes/{id}', [Recipe::class, 'patch'], 'recipes:write', 'recipe-patch', 'Change some fields'],
            ['DELETE', '/recipes/{id}', [Recipe::class, 'delete'], 'recipes:delete', null, 'Delete (entries keep the title)'],
            ['POST', '/recipes/{id}/restore', [Recipe::class, 'restore'], 'recipes:delete', null, 'Undo a delete'],
            ['POST', '/images', [Image::class, 'upload'], 'recipes:write', null, 'Store a photo (multipart `file` or a raw image body) → {url, thumbUrl}; use url as imageUrl'],

            ['POST', '/ai/import', [Ai::class, 'import'], 'ai:use', 'ai-import', 'Read a recipe from a link (JSON {url}) or a photo (multipart `photo` or an image/* body) → import job; 200 when finished, 202 while it runs'],
            ['GET', '/ai/jobs/{id}', [Ai::class, 'job'], 'ai:use', null, 'Poll an import job: step 0–3, then draft (a RecipeDraft for POST /recipes) or error'],

            ['GET', '/meal-slots', [Plan::class, 'slots'], 'mealplan:read', null, 'The four fixed slots'],
            ['GET', '/meal-plan', [Plan::class, 'list'], 'mealplan:read', null, 'Entries from..to'],
            ['POST', '/meal-plan/entries', [Plan::class, 'add'], 'mealplan:write', 'plan-entry', 'Plan a recipe or a text'],
            ['PATCH', '/meal-plan/entries/{id}', [Plan::class, 'move'], 'mealplan:write', 'plan-entry-patch', 'Move, reorder or change the servings of an entry'],
            ['DELETE', '/meal-plan/entries/{id}', [Plan::class, 'remove'], 'mealplan:write', null, 'Remove an entry'],
            ['POST', '/meal-plan/entries/{id}/restore', [Plan::class, 'restore'], 'mealplan:write', null, 'Undo a remove'],
            ['POST', '/meal-plan/seen', [Plan::class, 'seen'], 'session', 'ids', 'Agent-made entries were seen'],
            ['GET', '/meal-plan/presets', [Plan::class, 'presets'], 'mealplan:read', null, 'Free-text presets + recent own texts'],
            ['GET', '/suggestions', [Plan::class, 'suggestions'], 'recipes:read', null, 'Suggestion shelves for a week and slot'],

            ['GET', '/shopping/current', [Shop::class, 'current'], 'shopping:read', null, 'The open trip with its lines'],
            ['POST', '/shopping/trips', [Shop::class, 'setDays'], 'shopping:write', 'trip-days', 'Choose the days of the open trip'],
            ['PATCH', '/shopping/items/{key:.+}', [Shop::class, 'setItem'], 'shopping:write', 'item-patch', 'Check, mark "da" or move to a section'],
            ['POST', '/shopping/seen', [Shop::class, 'seen'], 'shopping:write', 'keys', 'Lines stop printing "neu"'],
            ['POST', '/shopping/manual-items', [Shop::class, 'addManual'], 'shopping:write', 'manual-item', 'Add an own item'],
            ['DELETE', '/shopping/manual-items/{id}', [Shop::class, 'removeManual'], 'shopping:write', null, 'Remove an own item'],
            ['POST', '/shopping/manual-items/{id}/restore', [Shop::class, 'restoreManual'], 'shopping:write', null, 'Undo a remove'],
            ['POST', '/shopping/trips/{id}/complete', [Shop::class, 'complete'], 'shopping:write', null, 'Finish the trip'],
            ['POST', '/shopping/trips/{id}/reopen', [Shop::class, 'reopen'], 'shopping:write', null, 'Undo finishing the trip'],
            ['GET', '/shopping/section-order', [Shop::class, 'getOrder'], 'shopping:read', null, 'Store section order'],
            ['PUT', '/shopping/section-order', [Shop::class, 'putOrder'], 'shopping:write', 'section-order', 'Save the section order'],

            ['GET', '/api-keys', [Agent::class, 'keys'], 'session', null, 'API keys'],
            ['POST', '/api-keys', [Agent::class, 'createKey'], 'session', 'api-key', 'Create a key (secret shown once)'],
            ['PATCH', '/api-keys/{id}', [Agent::class, 'patchKey'], 'session', 'api-key-patch', 'Set the setup label'],
            ['DELETE', '/api-keys/{id}', [Agent::class, 'revokeKey'], 'session', null, 'Revoke a key'],
            ['POST', '/api-keys/{id}/unrevoke', [Agent::class, 'unrevokeKey'], 'session', null, 'Undo a revoke (10 min)'],
            ['GET', '/agent-activity', [Agent::class, 'activity'], 'session', null, 'What agents did'],
            ['GET', '/agent-activity/unseen-count', [Agent::class, 'unseen'], 'session', null, 'Avatar dot and recipe marks'],
            ['POST', '/agent-activity/seen', [Agent::class, 'seen'], 'session', 'activity-seen', 'Mark activity seen'],
            ['POST', '/agent-activity/{id}/undo', [Agent::class, 'undo'], 'session', null, 'Undo one agent action'],
        ];
    }

    /** @return array{0: string, 1: string, 2: array, 3: string, 4: ?string, 5: string}|null */
    public static function byName(string $name): ?array
    {
        static $map = null;
        if ($map === null) {
            $map = [];
            foreach (self::all() as $r) {
                $map[self::name($r[0], $r[1])] = $r;
            }
        }
        return $map[$name] ?? null;
    }

    public static function name(string $method, string $path): string
    {
        return $method . ' ' . $path;
    }
}
