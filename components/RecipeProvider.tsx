"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { supabaseService } from '../lib/supabase';
import type { Recipe, RecipeInsert, RecipeUpdate, IngredientInsert, InstructionInsert, RecipeWithRelations } from '../lib/supabase';

interface RecipeContextType {
  recipes: RecipeWithRelations[];
  loading: boolean;
  refreshRecipes: (sortBy?: 'recent' | 'popular' | 'lastCooked' | 'created' | 'rating') => Promise<void>;
  addRecipe: (recipe: RecipeInsert, ingredients?: IngredientInsert[], instructions?: InstructionInsert[]) => Promise<RecipeWithRelations>;
  editRecipe: (id: string, recipe: RecipeUpdate, ingredients?: IngredientInsert[], instructions?: InstructionInsert[], oldImageUrl?: string) => Promise<void>;
  removeRecipe: (id: string, imageUrl?: string) => Promise<void>;
  uploadImage: (file: File) => Promise<string>;
  isUploading: boolean;
}

const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

export const RecipeProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<RecipeWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch all recipes once after login/session restore
  const fetchAllRecipes = useCallback(async (sortBy?: 'recent' | 'popular' | 'lastCooked' | 'created' | 'rating') => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await supabaseService.getRecipes(user.id, { sortBy });
      setRecipes(data);
    } catch (e) {
      console.error('Failed to fetch recipes:', e);
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      fetchAllRecipes();
    } else {
      setRecipes([]);
      setLoading(false);
    }
  }, [user, fetchAllRecipes]);

  // Add recipe
  const addRecipe = useCallback(async (recipe: RecipeInsert, ingredients?: IngredientInsert[], instructions?: InstructionInsert[]) => {
    if (!user?.id) throw new Error('User not authenticated');
    setLoading(true);
    try {
      const createdRecipe = await supabaseService.createRecipe(recipe, ingredients, instructions);
      await fetchAllRecipes();
      return createdRecipe;
    } catch (error) {
      console.error('Failed to add recipe:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchAllRecipes]);

  // Edit recipe
  const editRecipe = useCallback(async (id: string, recipe: RecipeUpdate, ingredients?: IngredientInsert[], instructions?: InstructionInsert[], oldImageUrl?: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // If image is being removed or changed, delete old image
      if (oldImageUrl && recipe.imageUrl !== oldImageUrl) {
        await supabaseService.deleteImage(oldImageUrl);
      }
      await supabaseService.updateRecipe(id, recipe, ingredients, instructions);
      await fetchAllRecipes();
    } catch (error) {
      console.error('Failed to edit recipe:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchAllRecipes]);

  // Remove recipe
  const removeRecipe = useCallback(async (id: string, imageUrl?: string) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await supabaseService.deleteRecipe(id);
      // Delete image from storage if exists
      if (imageUrl) {
        await supabaseService.deleteImage(imageUrl);
      }
      await fetchAllRecipes();
    } catch (error) {
      console.error('Failed to remove recipe:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchAllRecipes]);

  // Upload image
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    if (!user?.id) {
      throw new Error('User not authenticated');
    }

    setIsUploading(true);
    try {
      const publicUrl = await supabaseService.uploadImage(file, user.id);
      return publicUrl;
    } catch (error) {
      console.error('Failed to upload image:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, [user?.id]);

  const value: RecipeContextType = {
    recipes,
    loading,
    refreshRecipes: fetchAllRecipes,
    addRecipe,
    editRecipe,
    removeRecipe,
    uploadImage,
    isUploading,
  };

  return (
    <RecipeContext.Provider value={value}>
      {children}
    </RecipeContext.Provider>
  );
};

export function useRecipes() {
  const context = useContext(RecipeContext);
  if (context === undefined) {
    throw new Error('useRecipes must be used within a RecipeProvider');
  }
  return context;
}