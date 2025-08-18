import { createBrowserClient } from '@supabase/ssr'
import type { Database, Tables, TablesInsert, TablesUpdate } from './database.types'
import type { Session, User } from '@supabase/supabase-js'

// Type aliases for better readability
export type Recipe = Tables<'Recipe'>
export type RecipeInsert = TablesInsert<'Recipe'>
export type RecipeUpdate = TablesUpdate<'Recipe'>

export type Ingredient = Tables<'Ingredient'>
export type IngredientInsert = TablesInsert<'Ingredient'>
export type IngredientUpdate = TablesUpdate<'Ingredient'>

export type Instruction = Tables<'Instruction'>
export type InstructionInsert = TablesInsert<'Instruction'>
export type InstructionUpdate = TablesUpdate<'Instruction'>

export type MealPlan = Tables<'MealPlan'>
export type MealPlanInsert = TablesInsert<'MealPlan'>
export type MealPlanUpdate = TablesUpdate<'MealPlan'>

// Extended types for relations
export type MealPlanWithRecipe = MealPlan & {
  recipe: (Recipe & {
    ingredients: Ingredient[]
    instructions: Instruction[]
  }) | null
}

export type RecipeWithRelations = Recipe & {
  ingredients: Ingredient[]
  instructions: Instruction[]
  cookingStats?: {
    timesCooked: number
    lastCooked: string | null
  }
}

/**
 * Unified Supabase service class that handles all database operations,
 * authentication, and storage for the Essensplan application.
 */
export class SupabaseService {
  private static instance: SupabaseService
  private client: ReturnType<typeof createBrowserClient<Database>>

  private constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables')
    }
    
    this.client = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
  }

  /**
   * Get the singleton instance of SupabaseService
   */
  public static getInstance(): SupabaseService {
    if (!SupabaseService.instance) {
      SupabaseService.instance = new SupabaseService()
    }
    return SupabaseService.instance
  }

  /**
   * Get the underlying Supabase client
   */
  public getClient() {
    return this.client
  }

  // ======================
  // AUTHENTICATION METHODS
  // ======================

  /**
   * Sign up a new user
   */
  public async signUp(email: string, password: string, name?: string) {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0]
        }
      }
    })
    return { data, error }
  }

  /**
   * Sign in an existing user
   */
  public async signIn(email: string, password: string) {
    const { data, error } = await this.client.auth.signInWithPassword({
      email,
      password
    })
    return { data, error }
  }

  /**
   * Sign out the current user
   */
  public async signOut() {
    const { error } = await this.client.auth.signOut()
    return { error }
  }

  /**
   * Get the current authenticated user
   */
  public async getCurrentUser() {
    const { data: { user }, error } = await this.client.auth.getUser()
    return { user, error }
  }

  /**
   * Send password reset email
   */
  public async resetPassword(email: string) {
    const { data, error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    return { data, error }
  }

  /**
   * Update user password
   */
  public async updatePassword(password: string) {
    const { data, error } = await this.client.auth.updateUser({
      password
    })
    return { data, error }
  }

  /**
   * Update user profile
   */
  public async updateProfile(updates: { name?: string; avatar_url?: string }) {
    const { data, error } = await this.client.auth.updateUser({
      data: updates
    })
    return { data, error }
  }

  // ===============
  // RECIPE METHODS
  // ===============

  /**
   * Get all recipes for a user with optional filtering and sorting
   */
  public async getRecipes(userId: string, options?: {
    category?: string
    tags?: string[]
    sortBy?: 'recent' | 'popular' | 'lastCooked' | 'created' | 'rating'
  }): Promise<RecipeWithRelations[]> {
    let query = this.client
      .from('Recipe')
      .select(`
        *,
        ingredients:Ingredient(*),
        instructions:Instruction(*)
      `)
      .eq('userId', userId)
      .order('createdAt', { ascending: false })

    if (options?.category) {
      query = query.eq('category', options.category)
    }

    if (options?.tags && options.tags.length > 0) {
      query = query.contains('tags', JSON.stringify(options.tags))
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch recipes: ${error.message}`)
    }

    // Get cooking statistics for each recipe
    const recipesWithStats = await Promise.all(
      (data || []).map(async (recipe) => {
        const stats = await this.getRecipeCookingStats(recipe.id, userId)
        return {
          ...recipe,
          instructions: recipe.instructions?.sort((a, b) => a.stepNumber - b.stepNumber),
          cookingStats: stats
        }
      })
    )

    // Sort recipes based on sortBy option
    if (options?.sortBy) {
      recipesWithStats.sort((a, b) => {
        switch (options.sortBy) {
          case 'popular':
            return (b.cookingStats?.timesCooked || 0) - (a.cookingStats?.timesCooked || 0)
          case 'lastCooked':
            const aLastCooked = a.cookingStats?.lastCooked ? new Date(a.cookingStats.lastCooked).getTime() : 0
            const bLastCooked = b.cookingStats?.lastCooked ? new Date(b.cookingStats.lastCooked).getTime() : 0
            return bLastCooked - aLastCooked
          case 'rating':
            // Sort by rating (highest first), then by creation date if ratings are equal
            const aRating = a.rating || 0
            const bRating = b.rating || 0
            if (bRating !== aRating) {
              return bRating - aRating
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          case 'recent':
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          case 'created':
          default:
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        }
      })
    }

    return recipesWithStats
  }

  /**
   * Get a single recipe by ID
   */
  public async getRecipe(id: string): Promise<RecipeWithRelations> {
    const { data, error } = await this.client
      .from('Recipe')
      .select(`
        *,
        ingredients:Ingredient(*),
        instructions:Instruction(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      throw new Error(`Failed to fetch recipe: ${error.message}`)
    }

    // Sort instructions by stepNumber
    return {
      ...data,
      instructions: data.instructions?.sort((a, b) => a.stepNumber - b.stepNumber)
    }
  }

  /**
   * Create a new recipe with ingredients and instructions
   */
  public async createRecipe(
    recipeData: Omit<RecipeInsert, 'id'>, 
    ingredients?: IngredientInsert[], 
    instructions?: InstructionInsert[]
  ): Promise<RecipeWithRelations> {
    // Create the recipe first
    const { data: recipe, error: recipeError } = await this.client
      .from('Recipe')
      .insert({
        ...recipeData,
        id: crypto.randomUUID(),
        updatedAt: new Date().toISOString()
      })
      .select()
      .single()

    if (recipeError) {
      throw new Error(`Failed to create recipe: ${recipeError.message}`)
    }

    // Create ingredients if provided
    if (ingredients && ingredients.length > 0) {
      const ingredientsData = ingredients.map(ing => ({
        ...ing,
        id: crypto.randomUUID(),
        recipeId: recipe.id
      }))

      const { error: ingredientsError } = await this.client
        .from('Ingredient')
        .insert(ingredientsData)

      if (ingredientsError) {
        throw new Error(`Failed to create ingredients: ${ingredientsError.message}`)
      }
    }

    // Create instructions if provided
    if (instructions && instructions.length > 0) {
      const instructionsData = instructions.map((inst, index) => ({
        ...inst,
        id: crypto.randomUUID(),
        stepNumber: index + 1,
        recipeId: recipe.id
      }))

      const { error: instructionsError } = await this.client
        .from('Instruction')
        .insert(instructionsData)

      if (instructionsError) {
        throw new Error(`Failed to create instructions: ${instructionsError.message}`)
      }
    }

    // Return the complete recipe
    return this.getRecipe(recipe.id)
  }

  /**
   * Update an existing recipe with ingredients and instructions
   */
  public async updateRecipe(
    id: string, 
    recipeData: RecipeUpdate, 
    ingredients?: IngredientInsert[], 
    instructions?: InstructionInsert[]
  ): Promise<RecipeWithRelations> {
    // Delete existing ingredients and instructions
    await this.client
      .from('Ingredient')
      .delete()
      .eq('recipeId', id)

    await this.client
      .from('Instruction')
      .delete()
      .eq('recipeId', id)

    // Update recipe
    const { error: recipeError } = await this.client
      .from('Recipe')
      .update(recipeData)
      .eq('id', id)

    if (recipeError) {
      throw new Error(`Failed to update recipe: ${recipeError.message}`)
    }

    // Create new ingredients if provided
    if (ingredients && ingredients.length > 0) {
      const ingredientsData = ingredients.map(ing => ({
        ...ing,
        recipeId: id
      }))

      const { error: ingredientsError } = await this.client
        .from('Ingredient')
        .insert(ingredientsData)

      if (ingredientsError) {
        throw new Error(`Failed to create ingredients: ${ingredientsError.message}`)
      }
    }

    // Create new instructions if provided
    if (instructions && instructions.length > 0) {
      const instructionsData = instructions.map((inst, index) => ({
        ...inst,
        stepNumber: index + 1,
        recipeId: id
      }))

      const { error: instructionsError } = await this.client
        .from('Instruction')
        .insert(instructionsData)

      if (instructionsError) {
        throw new Error(`Failed to create instructions: ${instructionsError.message}`)
      }
    }

    // Return the updated recipe
    return this.getRecipe(id)
  }

  /**
   * Delete a recipe and all its related data
   */
  public async deleteRecipe(id: string): Promise<void> {
    const { error } = await this.client
      .from('Recipe')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete recipe: ${error.message}`)
    }
  }

  /**
   * Get cooking statistics for a recipe (how many times cooked, last cooked date)
   */
  public async getRecipeCookingStats(recipeId: string, userId: string): Promise<{
    timesCooked: number
    lastCooked: string | null
  }> {
    const { data, error } = await this.client
      .from('MealPlan')
      .select('date')
      .eq('recipeId', recipeId)
      .eq('userId', userId)
      .not('date', 'is', null)
      .lte('date', new Date().toISOString().split('T')[0]) // Only past dates
      .order('date', { ascending: false })

    if (error) {
      console.warn(`Failed to fetch cooking stats for recipe ${recipeId}:`, error.message)
      return { timesCooked: 0, lastCooked: null }
    }

    const timesCooked = data?.length || 0
    const lastCooked = data && data.length > 0 ? data[0].date : null

    return { timesCooked, lastCooked }
  }

  // ==================
  // MEAL PLAN METHODS
  // ==================

  /**
   * Get meal plans for a user within a date range
   */
  public async getMealPlans(userId: string, options?: {
    startDate?: string
    endDate?: string
  }): Promise<MealPlanWithRecipe[]> {
    let query = this.client
      .from('MealPlan')
      .select(`
        *,
        recipe:Recipe(
          *,
          ingredients:Ingredient(*),
          instructions:Instruction(*)
        )
      `)
      .eq('userId', userId)
      .order('date', { ascending: true })

    if (options?.startDate && options?.endDate) {
      query = query
        .gte('date', options.startDate)
        .lte('date', options.endDate)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch meal plans: ${error.message}`)
    }

    // Sort instructions by stepNumber for each recipe
    return data?.map(mealPlan => ({
      ...mealPlan,
      recipe: mealPlan.recipe ? {
        ...mealPlan.recipe,
        instructions: mealPlan.recipe.instructions?.sort((a, b) => a.stepNumber - b.stepNumber)
      } : null
    })) || []
  }

  /**
   * Create or update a meal plan for a specific date
   */
  public async createOrUpdateMealPlan(mealPlanData: { 
    date: string; 
    recipeId?: string; 
    userId: string 
  }): Promise<MealPlanWithRecipe> {
    // Check if meal plan already exists for this date and user
    const { data: existingMealPlan, error: checkError } = await this.client
      .from('MealPlan')
      .select('*')
      .eq('userId', mealPlanData.userId)
      .eq('date', mealPlanData.date)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
      throw new Error(`Failed to check existing meal plan: ${checkError.message}`)
    }

    if (existingMealPlan) {
      // Update existing meal plan
      const { data, error } = await this.client
        .from('MealPlan')
        .update({
          recipeId: mealPlanData.recipeId || null
        })
        .eq('id', existingMealPlan.id)
        .select(`
          *,
          recipe:Recipe(
            *,
            ingredients:Ingredient(*),
            instructions:Instruction(*)
          )
        `)
        .single()

      if (error) {
        throw new Error(`Failed to update meal plan: ${error.message}`)
      }

      // Sort instructions by stepNumber for the recipe
      return {
        ...data,
        recipe: data.recipe ? {
          ...data.recipe,
          instructions: data.recipe.instructions?.sort((a, b) => a.stepNumber - b.stepNumber)
        } : null
      }
    } else {
      // Create new meal plan
      const { data, error } = await this.client
        .from('MealPlan')
        .insert({
          ...mealPlanData,
          id: crypto.randomUUID(),
          updatedAt: new Date().toISOString()
        })
        .select(`
          *,
          recipe:Recipe(
            *,
            ingredients:Ingredient(*),
            instructions:Instruction(*)
          )
        `)
        .single()

      if (error) {
        throw new Error(`Failed to create meal plan: ${error.message}`)
      }

      // Sort instructions by stepNumber for the recipe
      return {
        ...data,
        recipe: data.recipe ? {
          ...data.recipe,
          instructions: data.recipe.instructions?.sort((a, b) => a.stepNumber - b.stepNumber)
        } : null
      }
    }
  }

  /**
   * Delete a meal plan
   */
  public async deleteMealPlan(id: string): Promise<void> {
    const { error } = await this.client
      .from('MealPlan')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(`Failed to delete meal plan: ${error.message}`)
    }
  }

  // ===============
  // STORAGE METHODS
  // ===============

  /**
   * Upload an image to Supabase Storage
   */
  public async uploadImage(file: File, userId: string): Promise<string> {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Invalid file type. Only images are allowed.')
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      throw new Error('File too large. Maximum size is 5MB.')
    }

    // Generate unique filename with user folder
    const fileExt = file.name.split('.').pop()?.toLowerCase()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const userFolder = `users/${userId}`
    const filePath = `${userFolder}/${fileName}`

    // Upload to user-specific folder in Supabase Storage
    const { data, error } = await this.client.storage
      .from('recipe-images')
      .upload(filePath, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      throw new Error(`Upload failed: ${error.message}`)
    }

    // Generate public URL
    const { data: { publicUrl } } = this.client.storage
      .from('recipe-images')
      .getPublicUrl(filePath)

    return publicUrl
  }

  /**
   * Delete an image from Supabase Storage
   */
  public async deleteImage(imageUrl: string): Promise<void> {
    const path = imageUrl.replace(/^.*\/storage\/v1\/object\/public\/recipe-images\//, '')
    const { error } = await this.client.storage
      .from('recipe-images')
      .remove([path])

    if (error) {
      throw new Error(`Failed to delete image: ${error.message}`)
    }
  }

  /**
   * Enhance a recipe image using AI
   * Returns base64 encoded image data for preview before upload
   */
  public async enhanceRecipeImage(
    imageUrl: string, 
    recipeTitle?: string, 
    ingredients?: string[]
  ): Promise<string> {
    // Get the current session for authentication
    const { data: { session }, error: sessionError } = await this.client.auth.getSession()
    
    if (sessionError || !session) {
      throw new Error('Sie müssen angemeldet sein, um Bildverbesserung zu verwenden.')
    }

    // Convert image URL to base64
    let base64ImageData: string
    try {
      const response = await fetch(imageUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`)
      }
      
      const blob = await response.blob()
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      
      base64ImageData = base64
    } catch (fetchError) {
      throw new Error(`Fehler beim Laden des Bildes: ${fetchError instanceof Error ? fetchError.message : 'Unbekannter Fehler'}`)
    }

    // Call the Supabase edge function
    const { data, error } = await this.client.functions.invoke('enhance-image', {
      body: {
        base64ImageData,
        recipeTitle,
        ingredients
      },
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      }
    })

    if (error) {
      throw new Error(error.message || 'Fehler bei der Bildverbesserung')
    }

    if (!data?.enhancedImageData) {
      throw new Error('Keine verbesserte Bildversion erhalten')
    }

    return data.enhancedImageData
  }
}

// Export singleton instance - this is the main export to use
export const supabaseService = SupabaseService.getInstance()

// Export the raw client for cases where direct access is needed
export const supabase = supabaseService.getClient()