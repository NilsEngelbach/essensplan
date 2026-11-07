// Synthetic demo content for the frontend prototype (not the family's real recipes).
// Photos: Wikimedia Commons, see public/demo/credits.json for authors and licences.
import { addDays, todayIso, weekStartOf } from './format'
import type { Category, Difficulty, Ingredient, Instruction, PlanEntry, Recipe, SlotKey, Tag } from './types'

type Ing = [name: string, amount: number | null, unit: string | null, component?: string | null, notes?: string | null]

interface Seed {
  id: string
  title: string
  description?: string
  photo?: string
  category: Category
  tags: Tag[]
  time: number
  servings: number
  difficulty: Difficulty
  rating: number | null
  cooked: number
  lastAgo: number | null
  createdAgo: number
  source?: string
  ingredients: Ing[]
  steps: string[]
}

const seeds: Seed[] = [
  {
    id: 'lasagne', title: 'Lasagne al forno', photo: 'lasagne', category: 'Hauptspeise', tags: [],
    description: 'Die Sonntagslasagne mit langsam geschmortem Ragù und selbstgemachter Béchamel.',
    time: 90, servings: 6, difficulty: 'Mittel', rating: 5, cooked: 9, lastAgo: 18, createdAgo: 610,
    ingredients: [
      ['Rinderhack', 500, 'g', 'Ragù'], ['Zwiebel', 1, null, 'Ragù'], ['Karotte', 1, null, 'Ragù'], ['Knoblauch', 2, 'Zehen', 'Ragù'],
      ['Passierte Tomaten', 700, 'g', 'Ragù'], ['Rotwein', 100, 'ml', 'Ragù', 'optional'], ['Butter', 50, 'g', 'Béchamel'],
      ['Mehl', 50, 'g', 'Béchamel'], ['Milch', 600, 'ml', 'Béchamel'], ['Muskatnuss', 1, 'Prise', 'Béchamel'],
      ['Lasagneplatten', 250, 'g', 'Schichten'], ['Parmesan', 80, 'g', 'Schichten', 'frisch gerieben'],
    ],
    steps: [
      'Zwiebel, Karotte und Knoblauch fein würfeln. Hack in einem großen Topf krümelig anbraten, Gemüse zugeben und 5 Minuten mitbraten.',
      'Mit Rotwein ablöschen, Tomaten zugeben und das Ragù zugedeckt bei kleiner Hitze 40 Minuten schmoren. Mit Salz und Pfeffer abschmecken.',
      'Für die Béchamel die Butter schmelzen, Mehl einrühren und nach und nach die Milch zugießen. 5 Minuten köcheln lassen, mit Muskat würzen.',
      'Ofen auf 180 °C Umluft vorheizen. Ragù, Platten und Béchamel abwechselnd in eine Form schichten, mit Béchamel und Parmesan abschließen.',
      '35 Minuten backen und vor dem Anschneiden 10 Minuten ruhen lassen.',
    ],
  },
  {
    id: 'couscous-salat', title: 'Couscous-Salat mit Linsen', photo: 'couscous-salat', category: 'Salat', tags: ['Vegan', 'Schnell', 'Gesund'],
    time: 25, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 6, lastAgo: 9, createdAgo: 420,
    ingredients: [
      ['Couscous', 200, 'g'], ['Gemüsebrühe', 250, 'ml', null, 'heiß'], ['Belugalinsen', 150, 'g', null, 'gekocht'], ['Gurke', 1, null],
      ['Kirschtomaten', 250, 'g'], ['Rote Zwiebel', 1, null], ['Petersilie', 1, 'Bund'], ['Zitrone', 1, null, null, 'Saft'], ['Olivenöl', 4, 'EL'],
    ],
    steps: [
      'Couscous mit der heißen Brühe übergießen, abdecken und 10 Minuten quellen lassen. Mit einer Gabel auflockern.',
      'Gurke und Tomaten würfeln, Zwiebel fein hacken, Petersilie grob schneiden.',
      'Alles mit Linsen, Zitronensaft und Öl mischen, mit Salz und Pfeffer abschmecken.',
    ],
  },
  {
    id: 'spaghetti-bolognese', title: 'Spaghetti Bolognese', photo: 'spaghetti-bolognese', category: 'Hauptspeise', tags: [],
    time: 50, servings: 4, difficulty: 'Einfach', rating: 5, cooked: 14, lastAgo: 4, createdAgo: 700,
    ingredients: [
      ['Spaghetti', 400, 'g'], ['Rinderhack', 400, 'g'], ['Zwiebel', 1, null], ['Knoblauch', 1, 'Zehe'], ['Tomatenmark', 2, 'EL'],
      ['Stückige Tomaten', 1, 'Dose', null, '400 g'], ['Oregano', 1, 'TL', null, 'getrocknet'], ['Parmesan', 40, 'g'],
    ],
    steps: [
      'Zwiebel und Knoblauch fein würfeln, mit dem Hack in Olivenöl kräftig anbraten.',
      'Tomatenmark kurz mitrösten, Tomaten und Oregano zugeben und 30 Minuten köcheln lassen.',
      'Spaghetti in Salzwasser bissfest kochen und mit der Sauce und Parmesan servieren.',
    ],
  },
  {
    id: 'shakshuka', title: 'Shakshuka', photo: 'shakshuka', category: 'Frühstück', tags: ['Vegetarisch', 'Würzig'],
    time: 30, servings: 2, difficulty: 'Einfach', rating: 4, cooked: 3, lastAgo: 70, createdAgo: 300,
    ingredients: [
      ['Eier', 4, null], ['Paprika, rot', 1, null], ['Zwiebel', 1, null], ['Knoblauch', 2, 'Zehen'], ['Stückige Tomaten', 400, 'g'],
      ['Kreuzkümmel', 1, 'TL'], ['Paprikapulver, edelsüß', 1, 'TL'], ['Feta', 50, 'g', null, 'optional'], ['Koriander', null, null, null, 'zum Bestreuen'],
    ],
    steps: [
      'Zwiebel, Paprika und Knoblauch in Streifen schneiden und in einer Pfanne 8 Minuten weich dünsten.',
      'Gewürze kurz mitrösten, Tomaten zugeben und 10 Minuten einkochen lassen.',
      'Vier Mulden formen, Eier hineinschlagen und zugedeckt 6–8 Minuten stocken lassen. Mit Feta und Koriander servieren.',
    ],
  },
  {
    id: 'flammkuchen', title: 'Flammkuchen klassisch', photo: 'flammkuchen', category: 'Hauptspeise', tags: [],
    time: 35, servings: 4, difficulty: 'Mittel', rating: 4, cooked: 5, lastAgo: 120, createdAgo: 520,
    ingredients: [
      ['Mehl', 250, 'g', 'Teig'], ['Wasser', 125, 'ml', 'Teig', 'lauwarm'], ['Olivenöl', 2, 'EL', 'Teig'], ['Salz', 1, 'Prise', 'Teig'],
      ['Schmand', 200, 'g', 'Belag'], ['Speckwürfel', 150, 'g', 'Belag'], ['Zwiebeln', 2, null, 'Belag', 'in feinen Ringen'],
    ],
    steps: [
      'Ofen mit Blech auf höchster Stufe (mind. 250 °C) vorheizen.',
      'Mehl, Wasser, Öl und Salz zu einem glatten Teig kneten und auf Backpapier hauchdünn ausrollen.',
      'Mit Schmand bestreichen, mit Speck und Zwiebeln belegen und salzen und pfeffern.',
      'Auf das heiße Blech ziehen und 10–12 Minuten knusprig backen.',
    ],
  },
  {
    id: 'ratatouille', title: 'Ratatouille aus dem Ofen', photo: 'ratatouille', category: 'Beilage', tags: ['Vegan', 'Glutenfrei', 'Gesund'],
    time: 60, servings: 4, difficulty: 'Einfach', rating: 3, cooked: 2, lastAgo: 200, createdAgo: 400,
    ingredients: [
      ['Aubergine', 1, null], ['Zucchini', 2, null], ['Paprika, gelb', 1, null], ['Tomaten', 4, null], ['Zwiebel', 1, null],
      ['Knoblauch', 3, 'Zehen'], ['Thymian', 4, 'Zweige'], ['Olivenöl', 5, 'EL'],
    ],
    steps: [
      'Ofen auf 200 °C vorheizen. Alles Gemüse in mundgerechte Stücke schneiden.',
      'Mit Öl, Knoblauch, Thymian, Salz und Pfeffer in einer Form mischen.',
      '45 Minuten rösten, nach der Hälfte einmal wenden.',
    ],
  },
  {
    id: 'bananenbrot', title: 'Bananenbrot ohne Zucker', photo: 'bananenbrot', category: 'Dessert', tags: ['Vegetarisch', 'Süß'],
    time: 70, servings: 12, difficulty: 'Einfach', rating: 5, cooked: 8, lastAgo: 25, createdAgo: 380,
    ingredients: [
      ['Bananen, sehr reif', 3, null], ['Eier', 2, null], ['Dinkelmehl', 200, 'g'], ['Haferflocken', 50, 'g'], ['Backpulver', 2, 'TL'],
      ['Zimt', 1, 'TL'], ['Rapsöl', 60, 'ml'], ['Walnüsse', 50, 'g', null, 'gehackt'],
    ],
    steps: [
      'Ofen auf 175 °C vorheizen, eine Kastenform fetten.',
      'Bananen zerdrücken und mit Eiern und Öl verrühren. Trockene Zutaten mischen und unterheben.',
      'Nüsse unterheben, Teig in die Form füllen und 50–55 Minuten backen (Stäbchenprobe).',
    ],
  },
  {
    id: 'linsensuppe', title: 'Rote Linsensuppe mit Kokos', photo: 'linsensuppe', category: 'Suppe', tags: ['Vegan', 'Glutenfrei', 'Schnell'],
    time: 30, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 7, lastAgo: 35, createdAgo: 330,
    ingredients: [
      ['Rote Linsen', 250, 'g'], ['Zwiebel', 1, null], ['Ingwer', 20, 'g'], ['Currypaste, rot', 1, 'EL'], ['Kokosmilch', 400, 'ml'],
      ['Gemüsebrühe', 800, 'ml'], ['Limette', 1, null, null, 'Saft'],
    ],
    steps: [
      'Zwiebel und Ingwer fein hacken und in etwas Öl glasig dünsten, Currypaste kurz mitrösten.',
      'Linsen, Brühe und Kokosmilch zugeben und 15 Minuten köcheln lassen, bis die Linsen zerfallen.',
      'Fein pürieren und mit Limettensaft und Salz abschmecken.',
    ],
  },
  {
    id: 'ofengemuese', title: 'Ofengemüse mit Feta', photo: 'ofengemuese', category: 'Hauptspeise', tags: ['Vegetarisch', 'Glutenfrei'],
    time: 45, servings: 3, difficulty: 'Einfach', rating: 4, cooked: 4, lastAgo: 50, createdAgo: 260,
    ingredients: [
      ['Süßkartoffel', 1, null], ['Kartoffeln', 500, 'g'], ['Rote Zwiebeln', 2, null], ['Brokkoli', 1, null], ['Feta', 200, 'g'],
      ['Olivenöl', 4, 'EL'], ['Rosmarin', 2, 'Zweige'],
    ],
    steps: [
      'Ofen auf 200 °C vorheizen. Kartoffeln und Süßkartoffel würfeln, Zwiebeln in Spalten schneiden.',
      'Mit Öl, Rosmarin und Salz auf einem Blech verteilen und 20 Minuten rösten.',
      'Brokkoliröschen zugeben, Feta darüberbröseln und weitere 15 Minuten backen.',
    ],
  },
  {
    id: 'kartoffelsuppe', title: 'Kartoffelsuppe mit Würstchen', category: 'Suppe', tags: [],
    time: 40, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 6, lastAgo: 60, createdAgo: 800,
    ingredients: [
      ['Kartoffeln, mehligkochend', 800, 'g'], ['Suppengrün', 1, 'Bund'], ['Zwiebel', 1, null], ['Gemüsebrühe', 1000, 'ml'],
      ['Wiener Würstchen', 4, null], ['Majoran', 1, 'TL'], ['Sahne', 100, 'ml'],
    ],
    steps: [
      'Kartoffeln, Suppengrün und Zwiebel würfeln und in etwas Butter anschwitzen.',
      'Mit Brühe auffüllen und 20 Minuten weich kochen. Mit einem Stampfer grob zerdrücken.',
      'Sahne und Majoran einrühren, Würstchen in Scheiben darin erwärmen.',
    ],
  },
  {
    id: 'pfannkuchen', title: 'Pfannkuchen', category: 'Frühstück', tags: ['Vegetarisch', 'Süß', 'Schnell'],
    time: 25, servings: 4, difficulty: 'Einfach', rating: 5, cooked: 12, lastAgo: 6, createdAgo: 900,
    ingredients: [
      ['Mehl', 250, 'g'], ['Milch', 500, 'ml'], ['Eier', 3, null], ['Salz', 1, 'Prise'], ['Butter', 30, 'g', null, 'zum Ausbacken'],
    ],
    steps: [
      'Mehl, Milch, Eier und Salz zu einem glatten Teig verrühren und 10 Minuten quellen lassen.',
      'In einer beschichteten Pfanne mit wenig Butter dünne Pfannkuchen goldbraun ausbacken.',
    ],
  },
  {
    id: 'kaesespaetzle', title: 'Käsespätzle mit Röstzwiebeln', category: 'Hauptspeise', tags: ['Vegetarisch'],
    time: 40, servings: 4, difficulty: 'Mittel', rating: 5, cooked: 7, lastAgo: 100, createdAgo: 750,
    ingredients: [
      ['Mehl', 400, 'g', 'Spätzle'], ['Eier', 4, null, 'Spätzle'], ['Mineralwasser', 150, 'ml', 'Spätzle'], ['Bergkäse', 200, 'g', 'Käse', 'gerieben'],
      ['Emmentaler', 100, 'g', 'Käse', 'gerieben'], ['Zwiebeln', 3, null, 'Röstzwiebeln'], ['Butter', 40, 'g', 'Röstzwiebeln'],
    ],
    steps: [
      'Mehl, Eier, Wasser und Salz zu einem zähen Teig schlagen, bis er Blasen wirft.',
      'Zwiebeln in Ringe schneiden und in Butter langsam goldbraun rösten.',
      'Teig portionsweise in kochendes Salzwasser schaben, Spätzle abschöpfen und lagenweise mit Käse in eine Form schichten.',
      'Bei 180 °C 10 Minuten überbacken und mit den Röstzwiebeln servieren.',
    ],
  },
  {
    id: 'gemuesecurry', title: 'Gemüsecurry mit Kichererbsen', category: 'Hauptspeise', tags: ['Vegan', 'Würzig'],
    time: 35, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 5, lastAgo: 21, createdAgo: 280,
    ingredients: [
      ['Kichererbsen', 1, 'Dose', null, 'abgetropft'], ['Süßkartoffel', 1, null], ['Blumenkohl', 0.5, null], ['Spinat', 100, 'g'],
      ['Kokosmilch', 400, 'ml'], ['Currypulver', 2, 'EL'], ['Reis', 250, 'g'],
    ],
    steps: [
      'Süßkartoffel würfeln, Blumenkohl in Röschen teilen. Reis nach Packungsangabe kochen.',
      'Currypulver in Öl anrösten, Gemüse und Kokosmilch zugeben und 15 Minuten köcheln.',
      'Kichererbsen und Spinat unterrühren, bis der Spinat zusammenfällt.',
    ],
  },
  {
    id: 'gnocchi-pfanne', title: 'Gnocchi-Pfanne mit Spinat', category: 'Hauptspeise', tags: ['Vegetarisch', 'Schnell'],
    time: 20, servings: 3, difficulty: 'Einfach', rating: 3, cooked: 2, lastAgo: 45, createdAgo: 150,
    ingredients: [
      ['Gnocchi', 500, 'g'], ['Babyspinat', 150, 'g'], ['Kirschtomaten', 200, 'g'], ['Knoblauch', 1, 'Zehe'], ['Mozzarella', 125, 'g'],
    ],
    steps: [
      'Gnocchi in Öl goldbraun braten.',
      'Knoblauch und halbierte Tomaten kurz mitbraten, Spinat zugeben.',
      'Mozzarella zerzupfen, darauf verteilen und zugedeckt schmelzen lassen.',
    ],
  },
  {
    id: 'mac-n-cheese', title: "Mac 'n' Cheese-Auflauf mit Brokkoli", category: 'Hauptspeise', tags: ['Vegetarisch'],
    time: 45, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 3, lastAgo: 80, createdAgo: 200,
    ingredients: [
      ['Makkaroni', 350, 'g'], ['Brokkoli', 1, null], ['Butter', 30, 'g'], ['Mehl', 30, 'g'], ['Milch', 500, 'ml'], ['Cheddar', 200, 'g'],
    ],
    steps: [
      'Makkaroni und Brokkoliröschen zusammen 2 Minuten kürzer als angegeben kochen.',
      'Aus Butter, Mehl und Milch eine Sauce kochen, zwei Drittel des Käses darin schmelzen.',
      'Alles mischen, mit restlichem Käse bestreuen und bei 200 °C 20 Minuten backen.',
    ],
  },
  {
    id: 'blumenkohl-auflauf', title: 'Blumenkohl-Brokkoli-Auflauf', category: 'Hauptspeise', tags: ['Vegetarisch', 'Glutenfrei'],
    time: 50, servings: 4, difficulty: 'Einfach', rating: null, cooked: 0, lastAgo: null, createdAgo: 12,
    source: 'https://www.example.com/blumenkohl-brokkoli-auflauf',
    ingredients: [
      ['Blumenkohl', 1, null], ['Brokkoli', 1, null], ['Sahne', 200, 'ml'], ['Eier', 2, null], ['Gouda', 150, 'g', null, 'gerieben'],
    ],
    steps: [
      'Blumenkohl und Brokkoli in Röschen teilen und 4 Minuten blanchieren.',
      'Sahne und Eier verquirlen, würzen und über das Gemüse in einer Form gießen.',
      'Mit Käse bestreuen und bei 190 °C 25 Minuten überbacken.',
    ],
  },
  {
    id: 'gurkensalat', title: 'Gurkensalat mit Dill', category: 'Salat', tags: ['Vegan', 'Schnell', 'Glutenfrei'],
    time: 15, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 9, lastAgo: 12, createdAgo: 640,
    ingredients: [['Salatgurken', 2, null], ['Dill', 1, 'Bund'], ['Weißweinessig', 3, 'EL'], ['Rapsöl', 2, 'EL'], ['Zucker', 1, 'Prise']],
    steps: ['Gurken hobeln, leicht salzen und 10 Minuten ziehen lassen.', 'Wasser abgießen, mit Essig, Öl, Zucker und gehacktem Dill mischen.'],
  },
  {
    id: 'porridge', title: 'Apfel-Zimt-Porridge', category: 'Frühstück', tags: ['Vegetarisch', 'Süß', 'Schnell'],
    time: 10, servings: 2, difficulty: 'Einfach', rating: 3, cooked: 4, lastAgo: 30, createdAgo: 220,
    ingredients: [['Haferflocken', 80, 'g'], ['Milch', 400, 'ml'], ['Apfel', 1, null], ['Zimt', 0.5, 'TL'], ['Ahornsirup', 1, 'EL', null, 'optional']],
    steps: ['Haferflocken mit Milch aufkochen und 5 Minuten unter Rühren quellen lassen.', 'Apfel reiben, mit Zimt unterrühren und nach Belieben süßen.'],
  },
  {
    id: 'haehnchen-reis', title: 'Hähnchen-Reis-Pfanne mit Paprika', category: 'Hauptspeise', tags: ['Schnell', 'Laktosefrei'],
    time: 30, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 10, lastAgo: 14, createdAgo: 560,
    ingredients: [
      ['Hähnchenbrust', 400, 'g'], ['Reis', 250, 'g'], ['Paprika, rot und gelb', 2, null], ['Frühlingszwiebeln', 3, null],
      ['Sojasauce', 3, 'EL'], ['Hühnerbrühe', 500, 'ml'],
    ],
    steps: [
      'Hähnchen in Streifen schneiden und scharf anbraten, herausnehmen.',
      'Paprika und Reis in der Pfanne andünsten, mit Brühe und Sojasauce ablöschen und 18 Minuten garen.',
      'Hähnchen und Frühlingszwiebeln unterheben und kurz erhitzen.',
    ],
  },
  {
    id: 'quarkauflauf', title: 'Quarkauflauf mit Kirschen', category: 'Dessert', tags: ['Süß', 'Vegetarisch'],
    time: 55, servings: 4, difficulty: 'Einfach', rating: 4, cooked: 2, lastAgo: 150, createdAgo: 480,
    ingredients: [['Magerquark', 500, 'g'], ['Eier', 3, null], ['Grieß', 60, 'g'], ['Zucker', 70, 'g'], ['Sauerkirschen', 1, 'Glas', null, 'abgetropft']],
    steps: ['Quark, Eier, Grieß und Zucker glatt rühren.', 'Kirschen in eine Form geben, Quarkmasse darüber verteilen und bei 180 °C 40 Minuten backen.'],
  },
  {
    id: 'bananenwaffeln', title: 'Bananenwaffeln ohne Zucker für Baby und Kinder', category: 'Snack', tags: ['Vegetarisch', 'Süß'],
    time: 20, servings: 8, difficulty: 'Einfach', rating: 5, cooked: 5, lastAgo: 40, createdAgo: 170,
    ingredients: [['Bananen', 2, null], ['Eier', 2, null], ['Dinkelmehl', 150, 'g'], ['Milch', 150, 'ml'], ['Backpulver', 1, 'TL']],
    steps: ['Bananen zerdrücken und mit den übrigen Zutaten zu einem dicken Teig verrühren.', 'Im heißen, gefetteten Waffeleisen portionsweise goldbraun backen.'],
  },
  {
    id: 'lahmacun', title: 'Veganes Blitz-Lahmacun', category: 'Hauptspeise', tags: ['Vegan', 'Schnell'],
    time: 25, servings: 4, difficulty: 'Einfach', rating: null, cooked: 1, lastAgo: 300, createdAgo: 330,
    source: 'https://www.example.com/veganes-blitz-lahmacun',
    ingredients: [
      ['Wraps', 4, null, 'Boden'], ['Sojahack', 100, 'g', 'Belag', 'eingeweicht'], ['Tomatenmark', 3, 'EL', 'Belag'], ['Paprika, rot', 1, null, 'Belag'],
      ['Petersilie', 0.5, 'Bund', 'Topping'], ['Zitrone', 1, null, 'Topping'],
    ],
    steps: ['Ofen auf 220 °C vorheizen. Sojahack mit Tomatenmark, fein gehackter Paprika und Gewürzen mischen.', 'Dünn auf die Wraps streichen und 8 Minuten knusprig backen.', 'Mit Petersilie und Zitronensaft servieren.'],
  },
]

function toRecipe(s: Seed): Recipe {
  const today = todayIso()
  const created = `${addDays(today, -s.createdAgo)}T09:00:00+01:00`
  const ingredients: Ingredient[] = s.ingredients.map(([name, amount, unit, component, notes], i) => ({
    id: `${s.id}-i${i}`, name, amount, unit, component: component ?? null, notes: notes ?? null,
  }))
  const instructions: Instruction[] = s.steps.map((description, i) => ({ id: `${s.id}-s${i}`, stepNumber: i + 1, description }))
  return {
    id: s.id,
    title: s.title,
    description: s.description ?? null,
    imageUrl: s.photo ? `/demo/${s.photo}.jpg` : null,
    category: s.category,
    tags: s.tags,
    cookingTime: s.time,
    servings: s.servings,
    difficulty: s.difficulty,
    rating: s.rating,
    sourceUrl: s.source ?? null,
    createdAt: created,
    updatedAt: created,
    ingredients,
    instructions,
    cookingStats: { timesCooked: s.cooked, lastCooked: s.lastAgo === null ? null : addDays(today, -s.lastAgo) },
  }
}

export function demoRecipes(): Recipe[] {
  return seeds.map(toRecipe)
}

/** A plausible import result for the capture flow demo. */
export function demoImport(source: string): Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'cookingStats'> {
  return {
    title: 'Gnocchi mit Salbeibutter und Kürbis',
    description: 'Aus dem Link übernommen.',
    imageUrl: null,
    category: 'Hauptspeise',
    tags: ['Vegetarisch', 'Schnell'],
    cookingTime: 25,
    servings: 2,
    difficulty: 'Einfach',
    rating: null,
    sourceUrl: source.startsWith('http') ? source : null,
    ingredients: [
      { id: 'n0', name: 'Gnocchi', amount: 500, unit: 'g', notes: null, component: null },
      { id: 'n1', name: 'Hokkaido-Kürbis', amount: 300, unit: 'g', notes: 'gewürfelt', component: null },
      { id: 'n2', name: 'Butter', amount: 60, unit: 'g', notes: null, component: 'Salbeibutter' },
      { id: 'n3', name: 'Salbei', amount: 12, unit: 'Blätter', notes: null, component: 'Salbeibutter' },
      { id: 'n4', name: 'Parmesan', amount: 30, unit: 'g', notes: 'gehobelt', component: null },
    ],
    instructions: [
      { id: 'm0', stepNumber: 1, description: 'Kürbis in Öl 10 Minuten goldbraun braten und salzen.' },
      { id: 'm1', stepNumber: 2, description: 'Gnocchi zugeben und weitere 5 Minuten braten.' },
      { id: 'm2', stepNumber: 3, description: 'Butter mit Salbei aufschäumen lassen, über die Gnocchi geben und mit Parmesan servieren.' },
    ],
  }
}

/**
 * A lived-in plan around today: the running week mostly planned (incl. a side,
 * a dinner and a free-text day) and one lunch an agent put into next week.
 */
export function demoPlan(weekStart: number): PlanEntry[] {
  const today = todayIso()
  const start = weekStartOf(today, weekStart)
  const at = (offset: number) => addDays(start, offset)
  const entries: PlanEntry[] = []
  const add = (date: string, slot: SlotKey, recipeId: string | null, note: string | null = null, createdVia: PlanEntry['createdVia'] = 'app') => {
    const position = entries.filter((e) => e.date === date && e.slot === slot).length
    entries.push({ id: `demo-${entries.length}`, date, slot, recipeId, note, position, createdVia, seenAt: null })
  }
  add(at(0), 'lunch', 'spaghetti-bolognese')
  add(at(1), 'lunch', 'linsensuppe')
  add(at(2), 'lunch', 'haehnchen-reis')
  add(at(2), 'lunch', 'gurkensalat')
  add(at(3), 'lunch', null, 'Reste')
  add(at(4), 'lunch', 'gemuesecurry')
  add(at(4), 'dinner', 'flammkuchen')
  add(at(5), 'lunch', 'ofengemuese')
  add(at(6), 'lunch', null, 'Bei Oma')
  add(at(10), 'lunch', 'gnocchi-pfanne', null, 'mcp')
  return entries
}
