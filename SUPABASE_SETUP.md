# Supabase Setup Guide für Essensplan

Diese Anleitung führt Sie durch die Einrichtung von Supabase für den Essensplaner.

## 1. Supabase Projekt erstellen

1. Gehen Sie zu [supabase.com](https://supabase.com)
2. Klicken Sie auf "Start your project"
3. Melden Sie sich an oder erstellen Sie ein Konto
4. Klicken Sie auf "New Project"
5. Wählen Sie Ihre Organisation
6. Geben Sie einen Projektnamen ein (z.B. "essensplan")
7. Wählen Sie ein Datenbank-Passwort (notieren Sie es!)
8. Wählen Sie eine Region (am besten nahe an Ihrem Standort)
9. Klicken Sie auf "Create new project"

## 2. Projekt-URL und API-Keys finden

1. Gehen Sie zu Ihrem Projekt-Dashboard
2. Klicken Sie auf "Settings" (Zahnrad-Symbol) in der linken Seitenleiste
3. Klicken Sie auf "API"
4. Notieren Sie sich:
   - **Project URL**: `https://[YOUR-PROJECT-REF].supabase.co`
   - **anon public key**: Der lange String unter "anon public"

## 3. Datenbank-URL finden

1. Bleiben Sie in den API-Einstellungen
2. Scrollen Sie nach unten zu "Connection string"
3. Wählen Sie "URI" aus
4. Kopieren Sie die URL und ersetzen Sie `[YOUR-PASSWORD]` mit Ihrem Datenbank-Passwort

## 4. Storage Bucket erstellen

1. Gehen Sie zu "Storage" in der linken Seitenleiste
2. Klicken Sie auf "Create a new bucket"
3. Geben Sie als Namen `recipe-images` ein
4. Wählen Sie "Public bucket" aus (damit Bilder öffentlich zugänglich sind)
5. Klicken Sie auf "Create bucket"

## 5. Authentifizierung konfigurieren

### 5.1 E-Mail-Authentifizierung aktivieren

1. Gehen Sie zu "Authentication" → "Settings"
2. Stellen Sie sicher, dass "Enable email confirmations" aktiviert ist
3. Optional: Konfigurieren Sie die E-Mail-Templates unter "Email Templates"

### 5.2 Site URL konfigurieren

1. Gehen Sie zu "Authentication" → "Settings"
2. Fügen Sie unter "Site URL" hinzu:
   - `http://localhost:3000` (für Entwicklung)
   - `https://your-domain.com` (für Produktion)

### 5.3 Redirect URLs konfigurieren

1. Gehen Sie zu "Authentication" → "Settings"
2. Fügen Sie unter "Redirect URLs" hinzu:
   - `http://localhost:3000/auth/callback`
   - `https://your-domain.com/auth/callback`

## 6. RLS (Row Level Security) konfigurieren

### Für die Recipe Tabelle:
```sql
-- Enable RLS
ALTER TABLE "Recipe" ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see only their own recipes
CREATE POLICY "Users can view own recipes" ON "Recipe"
  FOR SELECT USING (auth.uid()::text = "userId");

-- Create policy for users to insert their own recipes
CREATE POLICY "Users can insert own recipes" ON "Recipe"
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");

-- Create policy for users to update their own recipes
CREATE POLICY "Users can update own recipes" ON "Recipe"
  FOR UPDATE USING (auth.uid()::text = "userId");

-- Create policy for users to delete their own recipes
CREATE POLICY "Users can delete own recipes" ON "Recipe"
  FOR DELETE USING (auth.uid()::text = "userId");
```

### Für die Ingredient Tabelle:
```sql
-- Enable RLS
ALTER TABLE "Ingredient" ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see ingredients of their own recipes
CREATE POLICY "Users can view ingredients of own recipes" ON "Ingredient"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Ingredient"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );

-- Create policy for users to insert ingredients for their own recipes
CREATE POLICY "Users can insert ingredients for own recipes" ON "Ingredient"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Ingredient"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );

-- Create policy for users to update ingredients of their own recipes
CREATE POLICY "Users can update ingredients of own recipes" ON "Ingredient"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Ingredient"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );

-- Create policy for users to delete ingredients of their own recipes
CREATE POLICY "Users can delete ingredients of own recipes" ON "Ingredient"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Ingredient"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );
```

### Für die Instruction Tabelle:
```sql
-- Enable RLS
ALTER TABLE "Instruction" ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see instructions of their own recipes
CREATE POLICY "Users can view instructions of own recipes" ON "Instruction"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Instruction"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );

-- Create policy for users to insert instructions for their own recipes
CREATE POLICY "Users can insert instructions for own recipes" ON "Instruction"
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Instruction"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );

-- Create policy for users to update instructions of their own recipes
CREATE POLICY "Users can update instructions of own recipes" ON "Instruction"
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Instruction"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );

-- Create policy for users to delete instructions of their own recipes
CREATE POLICY "Users can delete instructions of own recipes" ON "Instruction"
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM "Recipe" 
      WHERE "Recipe".id = "Instruction"."recipeId" 
      AND "Recipe"."userId" = auth.uid()::text
    )
  );
```

### Für die MealPlan Tabelle:
```sql
-- Enable RLS
ALTER TABLE "MealPlan" ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see only their own meal plans
CREATE POLICY "Users can view own meal plans" ON "MealPlan"
  FOR SELECT USING (auth.uid()::text = "userId");

-- Create policy for users to insert their own meal plans
CREATE POLICY "Users can insert own meal plans" ON "MealPlan"
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");

-- Create policy for users to update their own meal plans
CREATE POLICY "Users can update own meal plans" ON "MealPlan"
  FOR UPDATE USING (auth.uid()::text = "userId");

-- Create policy for users to delete their own meal plans
CREATE POLICY "Users can delete own meal plans" ON "MealPlan"
  FOR DELETE USING (auth.uid()::text = "userId");
```

### Für Storage:
1. Gehen Sie zu "Storage" → "Policies"
2. Klicken Sie auf "New Policy"
3. Wählen Sie "Create a policy from scratch"
4. Geben Sie einen Namen ein: "Users can upload to their own folder"
5. Wählen Sie "INSERT" als Operation
6. Policy: `auth.role() = 'authenticated' AND bucket_id = 'recipe-images' AND (storage.foldername(name))[1] = 'users' AND (storage.foldername(name))[2] = auth.uid()::text`
7. Wiederholen Sie für "SELECT" mit der gleichen Policy
8. Wiederholen Sie für "UPDATE" mit der gleichen Policy
9. Wiederholen Sie für "DELETE" mit der gleichen Policy

**Wichtig**: Stellen Sie sicher, dass der Bucket `recipe-images` als "Public bucket" konfiguriert ist, damit die Bilder öffentlich zugänglich sind.

**Ordnerstruktur**: Die Bilder werden in user-spezifischen Ordnern gespeichert: `users/{user-id}/{filename}`
