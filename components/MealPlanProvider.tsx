"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { supabaseService } from '../lib/supabase';
import type { MealPlan, MealPlanWithRecipe } from '../lib/supabase';

interface MealPlanContextType {
  mealPlans: MealPlanWithRecipe[];
  loading: boolean;
  refreshMealPlans: (startDate?: string, endDate?: string) => Promise<void>;
  addOrUpdateMealPlan: (date: string, recipeId?: string) => Promise<void>;
  removeMealPlan: (id: string) => Promise<void>;
  getMealPlanForDate: (date: string) => MealPlanWithRecipe | undefined;
}

const MealPlanContext = createContext<MealPlanContextType | undefined>(undefined);

export const MealPlanProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [mealPlans, setMealPlans] = useState<MealPlanWithRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  // Get current week's start and end dates (7 days ahead from today)
  const getCurrentWeekRange = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 6); // 7 days ahead (including today)
    
    return {
      startDate: today.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  };

  // Fetch meal plans for a date range
  const fetchMealPlans = useCallback(async (startDate?: string, endDate?: string) => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      const { startDate: defaultStart, endDate: defaultEnd } = getCurrentWeekRange();
      const data = await supabaseService.getMealPlans(user.id, {
        startDate: startDate || defaultStart,
        endDate: endDate || defaultEnd
      });
      setMealPlans(data);
    } catch (error) {
      console.error('Failed to fetch meal plans:', error);
      setMealPlans([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Load meal plans on user change
  useEffect(() => {
    if (user) {
      fetchMealPlans();
    } else {
      setMealPlans([]);
      setLoading(false);
    }
  }, [user, fetchMealPlans]);

  // Add or update meal plan
  const addOrUpdateMealPlan = useCallback(async (date: string, recipeId?: string) => {
    if (!user?.id) return;
    
    setLoading(true);
    try {
      await supabaseService.createOrUpdateMealPlan({
        date,
        recipeId,
        userId: user.id
      });
      await fetchMealPlans();
    } catch (error) {
      console.error('Failed to add/update meal plan:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user?.id, fetchMealPlans]);

  // Remove meal plan
  const removeMealPlan = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await supabaseService.deleteMealPlan(id);
      await fetchMealPlans();
    } catch (error) {
      console.error('Failed to remove meal plan:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [fetchMealPlans]);

  // Get meal plan for specific date
  const getMealPlanForDate = useCallback((date: string) => {
    return mealPlans.find(mp => {
      // Handle both date string formats
      const mealPlanDate = typeof mp.date === 'string' ? mp.date.split('T')[0] : mp.date;
      const searchDate = date.split('T')[0];
      return mealPlanDate === searchDate;
    });
  }, [mealPlans]);

  const value: MealPlanContextType = {
    mealPlans,
    loading,
    refreshMealPlans: fetchMealPlans,
    addOrUpdateMealPlan,
    removeMealPlan,
    getMealPlanForDate,
  };

  return (
    <MealPlanContext.Provider value={value}>
      {children}
    </MealPlanContext.Provider>
  );
};

export function useMealPlans() {
  const context = useContext(MealPlanContext);
  if (context === undefined) {
    throw new Error('useMealPlans must be used within a MealPlanProvider');
  }
  return context;
}