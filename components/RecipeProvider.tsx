"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { supabaseService } from '../lib/supabase';
import type { RecipeInsert, RecipeUpdate, IngredientInsert, InstructionInsert, RecipeWithRelations } from '../lib/supabase';

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
  const [lastFetchedUserId, setLastFetchedUserId] = useState<string | null>(null);
  const fetchAllRecipesRef = useRef<(sortBy?: 'recent' | 'popular' | 'lastCooked' | 'created' | 'rating') => Promise<void>>();

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

  fetchAllRecipesRef.current = fetchAllRecipes;

  useEffect(() => {
    if (user && user.id !== lastFetchedUserId) {
      setLastFetchedUserId(user.id);
      fetchAllRecipesRef.current?.();
    } else if (!user) {
      setRecipes([]);
      setLastFetchedUserId(null);
      setLoading(false);
    }
  }, [user, lastFetchedUserId]);

  // Add recipe
  const addRecipe = useCallback(async (recipe: RecipeInsert, ingredients?: IngredientInsert[], instructions?: InstructionInsert[]) => {
    if (!user?.id) throw new Error('User not authenticated');
    try {
      const createdRecipe = await supabaseService.createRecipe(recipe, ingredients, instructions);
      // Update local state directly instead of refetching all recipes
      setRecipes(prevRecipes => [createdRecipe, ...prevRecipes]);
      return createdRecipe;
    } catch (error) {
      console.error('Failed to add recipe:', error);
      throw error;
    }
  }, [user?.id]);

  // Edit recipe
  const editRecipe = useCallback(async (id: string, recipe: RecipeUpdate, ingredients?: IngredientInsert[], instructions?: InstructionInsert[], oldImageUrl?: string) => {
    if (!user?.id) return;
    try {
      // If image is being removed or changed, delete old image
      if (oldImageUrl && recipe.imageUrl !== oldImageUrl) {
        await supabaseService.deleteImage(oldImageUrl);
      }
      const updatedRecipe = await supabaseService.updateRecipe(id, recipe, ingredients, instructions);
      // Update local state directly instead of refetching all recipes
      setRecipes(prevRecipes => 
        prevRecipes.map(r => r.id === id ? updatedRecipe : r)
      );
    } catch (error) {
      console.error('Failed to edit recipe:', error);
      throw error;
    }
  }, [user?.id]);

  // Remove recipe
  const removeRecipe = useCallback(async (id: string, imageUrl?: string) => {
    if (!user?.id) return;
    try {
      await supabaseService.deleteRecipe(id);
      // Delete image from storage if exists
      if (imageUrl) {
        await supabaseService.deleteImage(imageUrl);
      }
      // Update local state directly instead of refetching all recipes
      setRecipes(prevRecipes => prevRecipes.filter(r => r.id !== id));
    } catch (error) {
      console.error('Failed to remove recipe:', error);
      throw error;
    }
  }, [user?.id]);

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