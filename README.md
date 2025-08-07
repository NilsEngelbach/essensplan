# Essensplan - Familien Essensplaner

Ein moderner, KI-gestützter Essensplaner für Familien, der das Organisieren von Mahlzeiten, das Verwalten von Rezepten und die Wochenplanung vereinfacht.

## Features

### 🍳 Rezeptverwaltung
- **Rezepte erstellen**: Vollständige Rezeptformulare mit Zutaten, Zubereitungsschritten und Bildern
- **Rezepte bearbeiten**: Bestehende Rezepte anpassen und aktualisieren
- **Rezepte durchsuchen**: Filterung nach Kategorien, Tags und Suchbegriffen
- **Rezeptdetails**: Detaillierte Ansicht mit allen Informationen und Zubereitungsschritten

### 📅 Essensplanung
- **Wochenplan**: Visueller Wochenplan mit Drag & Drop Funktionalität
- **Rezepte zuweisen**: Einfaches Hinzufügen von Rezepten zu bestimmten Tagen
- **Plan verwalten**: Rezepte aus dem Plan entfernen oder ändern
- **Statistiken**: Übersicht über geplante Mahlzeiten und Kochzeiten

### 🔐 Authentifizierung
- **Supabase Integration**: Sichere Benutzerauthentifizierung
- **Benutzerprofile**: Persönliche Rezeptsammlungen und Essenspläne
- **Sitzungsverwaltung**: Automatische Anmeldung und Abmeldung

### 🎨 Benutzerfreundlichkeit
- **Responsive Design**: Optimiert für Desktop, Tablet und Mobile
- **Moderne UI**: Clean Design mit Tailwind CSS
- **Intuitive Navigation**: Einfache Navigation zwischen allen Bereichen
- **Toast-Benachrichtigungen**: Feedback für alle Aktionen

## Technologie-Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Datenbank**: PostgreSQL mit Prisma ORM
- **Authentifizierung**: Supabase
- **Icons**: Lucide React
- **Notifications**: React Hot Toast

## Installation

1. **Repository klonen**
   ```bash
   git clone <repository-url>
   cd essensplan
   ```

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

3. **Umgebungsvariablen konfigurieren**
   Erstellen Sie eine `.env` Datei:
   ```env
   DATABASE_URL="your-postgresql-database-url"
   DIRECT_URL="your-postgresql-direct-url"
   NEXT_PUBLIC_SUPABASE_URL="your-supabase-url"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="your-supabase-anon-key"
   SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"
   ```

4. **Datenbank einrichten**
   ```bash
   # Prisma Client generieren
   npx prisma generate
   # Schema zur Datenbank pushen
   npx prisma db push
   # Prisma Studio öffnen (für Datenbank-Management)
   npx prisma studio
   # Datenbank-Status prüfen
   npx prisma db pull
   # Migration erstellen (falls nötig)
   npx prisma migrate dev --name init

   # Create types for supabase client
   npx supabase gen types typescript --project-id <peoject-id> --schema public > database.types.ts
   ```

5. **Entwicklungsserver starten**
   ```bash
   npm run dev
   ```

## Verwendung

### Erste Schritte
1. Registrieren Sie sich mit Ihrer E-Mail-Adresse
2. Erstellen Sie Ihr erstes Rezept über "Neues Rezept"
3. Planen Sie Ihre Mahlzeiten im Essensplan

### Rezepte verwalten
- **Erstellen**: Verwenden Sie das Rezeptformular mit allen Details
- **Bearbeiten**: Klicken Sie auf "Bearbeiten" in der Rezeptdetailansicht
- **Löschen**: Bestätigen Sie das Löschen im Modal-Dialog
- **Durchsuchen**: Nutzen Sie die Filteroptionen in der Rezeptübersicht

### Essensplanung
- **Woche auswählen**: Navigieren Sie zwischen den Wochen
- **Rezept hinzufügen**: Wählen Sie aus Ihrer Rezeptsammlung
- **Plan anpassen**: Entfernen oder ändern Sie geplante Mahlzeiten
- **Übersicht**: Sehen Sie Statistiken und geplante Rezepte

## API-Endpunkte

### Rezepte
- `GET /api/recipes` - Alle Rezepte eines Benutzers abrufen
- `POST /api/recipes` - Neues Rezept erstellen
- `GET /api/recipes/[id]` - Spezifisches Rezept abrufen
- `PUT /api/recipes/[id]` - Rezept aktualisieren
- `DELETE /api/recipes/[id]` - Rezept löschen

### Essensplan
- `GET /api/meal-plans` - Essensplan für einen Zeitraum abrufen
- `POST /api/meal-plans` - Mahlzeit zum Plan hinzufügen
- `DELETE /api/meal-plans/[id]` - Mahlzeit vom Plan entfernen

## Datenbankschema

### Recipe
- `id`: Eindeutige ID
- `title`: Rezepttitel
- `description`: Beschreibung
- `category`: Kategorie (Hauptspeise, Salat, etc.)
- `tags`: JSON-Array von Tags
- `cookingTime`: Kochzeit in Minuten
- `servings`: Anzahl Portionen
- `difficulty`: Schwierigkeitsgrad
- `imageUrl`: URL zum Titelbild
- `userId`: Supabase Benutzer-ID

### Ingredient
- `id`: Eindeutige ID
- `name`: Zutatname
- `amount`: Menge
- `unit`: Einheit
- `notes`: Notizen
- `recipeId`: Referenz zum Rezept

### Instruction
- `id`: Eindeutige ID
- `stepNumber`: Schrittnummer
- `description`: Beschreibung des Schritts
- `imageUrl`: Optionales Bild für den Schritt
- `recipeId`: Referenz zum Rezept

### MealPlan
- `id`: Eindeutige ID
- `date`: Datum
- `recipeId`: Referenz zum Rezept (optional)
- `userId`: Supabase Benutzer-ID

## Entwicklung

### Skripte
- `npm run dev` - Entwicklungsserver starten
- `npm run build` - Produktionsbuild erstellen
- `npm run start` - Produktionsserver starten
- `npm run lint` - Code-Linting
- `npm run db:generate` - Prisma Client generieren
- `npm run db:push` - Datenbankschema pushen
- `npm run db:studio` - Prisma Studio öffnen

### Ordnerstruktur
```
essensplan/
├── app/                    # Next.js App Router
│   ├── api/               # API-Routen
│   ├── recipes/           # Rezept-Seiten
│   ├── meal-plan/         # Essensplan-Seite
│   └── globals.css        # Globale Styles
├── components/            # React-Komponenten
├── lib/                  # Utility-Funktionen
└── prisma/               # Datenbankschema
```
