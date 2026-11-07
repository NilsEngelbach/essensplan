<?php

declare(strict_types=1);

namespace Essensplan\Import;

/**
 * Rows of the old Next.js/Supabase app, as plain arrays. Timestamps are Unix
 * seconds (float), so the importer does not care whether a column was
 * timestamptz (auth) or Prisma's timestamp-in-UTC.
 */
interface ImportSource
{
    /**
     * Accounts that can log in with a password.
     *
     * @return list<array{id: string, email: string, password_hash: ?string, name: ?string, created_at: float, email_confirmed_at: ?float}>
     */
    public function users(): array;

    /**
     * A user's recipes with their ingredients (in the order the old app showed them) and steps.
     *
     * @return list<array<string, mixed>> Recipe columns (camelCase) + ingredients[] + instructions[]
     */
    public function recipes(string $userId): array;

    /** @return list<array{id: string, date: float, recipeId: ?string, createdAt: float, updatedAt: float}> */
    public function mealPlans(string $userId): array;
}
