# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Essensplan is a German family meal planning application built with Next.js 14, React 18, TypeScript, and Supabase.
It allows users to manage recipes, plan weekly meals, and organize family cooking with AI import capabilities.

## Key Development Commands

### Core Development
- `npm run dev` - Start development server on http://localhost:3000
- `npm run build` - Create production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint code linting

### Database Operations
- `npm run db:generate` - Generate Prisma client after schema changes
- `npm run db:push` - Push Prisma schema changes to database
- `npm run db:studio` - Open Prisma Studio for database management
- `npx prisma db pull` - Pull database schema changes
- `npx prisma migrate dev --name <name>` - Create and apply new migration

## Architecture

### Tech Stack
- **Frontend**: Next.js 14 with App Router, React 18, TypeScript
- **Styling**: Tailwind CSS with custom primary color palette
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Supabase Auth with Row Level Security (RLS)
- **Storage**: Supabase Storage for recipe images
- **API**: Supabase Edge Functions
- **UI Components**: Headless UI, Heroicons, Lucide React
- **Forms**: React Hook Form with Zod validation
- **Notifications**: React Hot Toast

### Project Structure
```
app/
├── grocery-list/         # Grocery list planner
├── meal-plan/            # Weekly meal planning interface
├── recipes/              # Recipe management (CRUD operations)
│   ├── [id]/             # Recipe detail and edit pages
│   └── new/              # Create new recipe
├── globals.css           # Global styles and Tailwind imports
├── layout.tsx            # Root layout with providers
└── page.tsx              # Home page

components/
├── AIImportModal.tsx     # Modal for importing recipes via AI
├── AuthProvider.tsx      # Supabase authentication context
├── LoginModal.tsx        # User login modal
├── Navigation.tsx        # Main navigation component
├── RecipeForm.tsx        # Form for creating/editing recipes
├── RecipeProvider.tsx    # Recipe data context
└── SignUpModal.tsx       # User registration modal

lib/
├── database.types.ts     # Generated Supabase TypeScript types
├── supabase-helpers.ts   # Utility functions for Supabase operations
└── supabase.ts          # Supabase client configuration and auth helpers

prisma/
└── schema.prisma        # Database schema with Recipe, Ingredient, Instruction, MealPlan models
```

### Data Models
- **Recipe**: Core recipe entity with title, description, category, tags, cooking time, difficulty
- **Ingredient**: Recipe ingredients with amounts, units, and notes
- **Instruction**: Step-by-step cooking instructions with optional images
- **MealPlan**: Calendar entries linking recipes to specific dates

### Authentication & Security
- All database operations use Row Level Security (RLS) policies
- Users can only access their own recipes and meal plans
- Image uploads are organized by user ID in Supabase Storage
- Authentication handled via Supabase with email/password

## Environment Variables Required

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# Supabase (frontend)
NEXT_PUBLIC_SUPABASE_URL="https://...supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
# Supabase (edge functions - set via `supabase secrets set ...`)
SUPABASE_URL="https://...supabase.co"
SUPABASE_SERVICE_ROLE_KEY="..."

# AI feature switch (openai | opencode), defaults to "opencode"
AI_PROVIDER="opencode"
# Public mirror for the frontend (must match AI_PROVIDER)
NEXT_PUBLIC_AI_PROVIDER="opencode"

# OpenCode Go credentials (used when AI_PROVIDER=opencode)
OPENCODE_API_KEY="..."        # from https://opencode.ai/auth
OPENCODE_MODEL="glm-5.2"     # e.g. glm-5.2 | kimi-k3 | deepseek-v4-pro | deepseek-v4-flash
OPENCODE_IMAGE_MODEL="kimi-k3"  # vision-capable model for screenshot imports

# OpenAI credentials (used when AI_PROVIDER=openai, still required for image enhancement)
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5-mini"
```

## Development Guidelines

### Database Changes
1. Always run `npm run db:generate` after modifying `prisma/schema.prisma`
2. Use `npm run db:push` for development schema changes
3. Create proper migrations with `npx prisma migrate dev` for production

### Authentication Context
- Use `AuthProvider` context for user state management
- Access current user via the authentication context in components
- All API routes should validate user authentication before data operations

### Styling Conventions
- Use Tailwind CSS utility classes
- Primary color palette defined in `tailwind.config.js` (blue variants)
- German language used for UI text and content
- Responsive design with mobile-first approach

### Component Patterns
- React contexts for global state (Auth, Recipe data)
- Form validation using React Hook Form + Zod
- Modal components for overlays (Login, SignUp, AI Import)
- Only use supabase functions for the ai integration, for data crud the supabase sdk should be used

### AI Integration
- AI Import:
  - OpenAI integration for recipe import from images and urls
  - Endpoint at `/supabase/functions/ai-import.ts`
  - Structured data extraction for recipe components
- AI Image Enhancement:
  - Enhance user uploaded images with AI
  - Endpoint at `/supabase/functions/enhance-image.ts`