 import { useState, useEffect, useCallback, useRef } from 'react';
 import { supabase } from '@/integrations/supabase/app-client';
 import { useAuth } from '@/contexts/AuthContext';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import type { SubCategory } from '@/types';

// Types matching database schema
export interface DbSpace {
   id: string;
   user_id: string;
   name: string;
   image: string | null;
   color: string | null;
   item_count: number;
   merged_from: string[] | null;
   position: number;
   created_at: string;
   updated_at: string;
   deleted_at: string | null;
   version: number;
   is_pinned: boolean;
   pinned_at: string | null;
   last_used_at: string;
   group_assignments: {
     groups: { label: string; item_ids: string[] }[];
     organized_at: string;
     item_count_at_organize: number;
   } | null;
   gif_background: string | null;
 }
 
 export interface DbItem {
   id: string;
   user_id: string;
   sub_category: SubCategory;
   title: string | null;
   content: string | null;
   blocks: any[];
   space_ids: string[] | null;
   people_ids: string[] | null;
   keywords: string[] | null;
   scheduled_date: string | null;
   scheduled_time: string | null;
   color: string | null;
   item_type: string | null;
   thumbnail: string | null;
   url: string | null;
  canvas_x: number | null;
  canvas_y: number | null;
  canvas_z: number | null;
  canvas_scale: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
  ai_processed: boolean | null;
  extracted_people: string[] | null;
  ai_summary: string | null;
  suggested_space: string | null;
  ai_tags: string[] | null;
}

export interface DbUserPreferences {
   id: string;
   user_id: string;
   ai_settings: Record<string, any>;
   theme: string | null;
   last_cleanup_date: string | null;
   created_at: string;
   updated_at: string;
 }
 
 // Hook for cloud spaces
 export function useCloudSpaces() {
   const { user } = useAuth();
   const [spaces, setSpaces] = useState<DbSpace[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<Error | null>(null);
   const pendingOps = useRef(new Set<string>());
 
   // Fetch all spaces for current user
   const fetchSpaces = useCallback(async () => {
     if (!user) {
       setSpaces([]);
       setLoading(false);
       return;
     }
 
     try {
       const { data, error: fetchError } = await supabase
         .from('spaces')
         .select('*')
         .eq('user_id', user.id)
         .order('position', { ascending: true });
 
       if (fetchError) throw fetchError;
       setSpaces((data as DbSpace[]) || []);
       setError(null);
     } catch (err) {
       console.error('Error fetching spaces:', err);
       setError(err as Error);
     } finally {
       setLoading(false);
     }
   }, [user]);
 
   useEffect(() => {
     fetchSpaces();
   }, [fetchSpaces]);
 
   // Create a new space
   const createSpace = useCallback(async (
     name: string, 
     image?: string, 
     color?: string
   ): Promise<string | null> => {
     if (!user) return null;
 
     const opId = `create-${Date.now()}`;
     pendingOps.current.add(opId);
 
     try {
       // Get max position
       const maxPosition = spaces.length > 0 
         ? Math.max(...spaces.map(s => s.position)) + 1 
         : 0;
 
       const { data, error: insertError } = await supabase
         .from('spaces')
         .insert({
           user_id: user.id,
           name,
           image: image || null,
           color: color || null,
           position: maxPosition,
         })
         .select()
         .single();
 
       if (insertError) throw insertError;
       
       setSpaces(prev => [...prev, data as DbSpace]);
       return data.id;
     } catch (err) {
       console.error('Error creating space:', err);
        showErrorPopup('Failed to save collection. Please try again.');
       return null;
     } finally {
       pendingOps.current.delete(opId);
     }
   }, [user, spaces]);
 
   // Update a space
   const updateSpace = useCallback(async (
     id: string, 
     updates: Partial<Pick<DbSpace, 'name' | 'image' | 'color' | 'item_count' | 'position' | 'merged_from'>>
   ): Promise<boolean> => {
     if (!user) return false;
 
     const opId = `update-${id}`;
     pendingOps.current.add(opId);
 
     // Optimistic update
     setSpaces(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
 
     try {
       const { error: updateError } = await supabase
         .from('spaces')
         .update(updates)
         .eq('id', id)
         .eq('user_id', user.id);
 
       if (updateError) throw updateError;
       return true;
     } catch (err) {
       console.error('Error updating space:', err);
        showErrorPopup('Failed to update collection.');
       // Revert on error
       await fetchSpaces();
       return false;
     } finally {
       pendingOps.current.delete(opId);
     }
   }, [user, fetchSpaces]);
 
   // Delete a space
   const deleteSpace = useCallback(async (id: string): Promise<boolean> => {
     if (!user) return false;
 
     const opId = `delete-${id}`;
     pendingOps.current.add(opId);
 
     // Optimistic update
     const previousSpaces = [...spaces];
     setSpaces(prev => prev.filter(s => s.id !== id));
 
     try {
       const { error: deleteError } = await supabase
         .from('spaces')
         .delete()
         .eq('id', id)
         .eq('user_id', user.id);
 
       if (deleteError) throw deleteError;
       return true;
     } catch (err) {
       console.error('Error deleting space:', err);
        showErrorPopup('Failed to delete collection.');
       setSpaces(previousSpaces);
       return false;
     } finally {
       pendingOps.current.delete(opId);
     }
   }, [user, spaces]);
 
   // Reorder spaces
   const reorderSpaces = useCallback(async (
     startIndex: number, 
     endIndex: number
   ): Promise<boolean> => {
     if (!user) return false;
 
     const newSpaces = [...spaces];
     const [removed] = newSpaces.splice(startIndex, 1);
     newSpaces.splice(endIndex, 0, removed);
 
     // Update positions
     const updates = newSpaces.map((space, index) => ({
       id: space.id,
       position: index,
     }));
 
     // Optimistic update
     setSpaces(newSpaces.map((s, i) => ({ ...s, position: i })));
 
     try {
       // Batch update positions
       for (const update of updates) {
         const { error: updateError } = await supabase
           .from('spaces')
           .update({ position: update.position })
           .eq('id', update.id)
           .eq('user_id', user.id);
 
         if (updateError) throw updateError;
       }
       return true;
     } catch (err) {
       console.error('Error reordering spaces:', err);
        showErrorPopup('Failed to reorder collections.');
       await fetchSpaces();
       return false;
     }
   }, [user, spaces, fetchSpaces]);
 
   return {
     spaces,
     loading,
     error,
     createSpace,
     updateSpace,
     deleteSpace,
     reorderSpaces,
     refetch: fetchSpaces,
   };
 }
 
 // Hook for cloud items
 export function useCloudItems() {
   const { user } = useAuth();
   const [items, setItems] = useState<DbItem[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<Error | null>(null);
 
   // Fetch all items for current user
   const fetchItems = useCallback(async () => {
     if (!user) {
       setItems([]);
       setLoading(false);
       return;
     }
 
     try {
       const { data, error: fetchError } = await supabase
         .from('items')
         .select('*')
         .eq('user_id', user.id)
         .order('created_at', { ascending: false });
 
       if (fetchError) throw fetchError;
       setItems((data as DbItem[]) || []);
       setError(null);
     } catch (err) {
       console.error('Error fetching items:', err);
       setError(err as Error);
     } finally {
       setLoading(false);
     }
   }, [user]);
 
   useEffect(() => {
     fetchItems();
   }, [fetchItems]);
 
   // Create a new item
   const createItem = useCallback(async (
     itemData: Omit<DbItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>
   ): Promise<string | null> => {
     if (!user) return null;
 
     try {
       const { data, error: insertError } = await supabase
         .from('items')
         .insert({
           user_id: user.id,
           sub_category: itemData.sub_category,
           title: itemData.title,
           content: itemData.content,
           blocks: itemData.blocks || [],
           space_ids: itemData.space_ids,
           people_ids: itemData.people_ids,
           keywords: itemData.keywords,
           scheduled_date: itemData.scheduled_date,
           scheduled_time: itemData.scheduled_time,
           color: itemData.color,
           item_type: itemData.item_type,
           thumbnail: itemData.thumbnail,
           url: itemData.url,
         })
         .select()
         .single();
 
       if (insertError) throw insertError;
       
       setItems(prev => [data as DbItem, ...prev]);
       return data.id;
     } catch (err) {
       console.error('Error creating item:', err);
        showErrorPopup('Failed to save item. Please try again.');
       return null;
     }
   }, [user]);
 
   // Update an item
   const updateItem = useCallback(async (
     id: string,
     updates: Partial<Omit<DbItem, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
   ): Promise<boolean> => {
     if (!user) return false;
 
     // Optimistic update
     setItems(prev => prev.map(item => 
       item.id === id ? { ...item, ...updates } : item
     ));
 
     try {
       const { error: updateError } = await supabase
         .from('items')
         .update(updates)
         .eq('id', id)
         .eq('user_id', user.id);
 
       if (updateError) throw updateError;
       return true;
     } catch (err) {
       console.error('Error updating item:', err);
        showErrorPopup('Failed to update item.');
       await fetchItems();
       return false;
     }
   }, [user, fetchItems]);
 
   // Delete an item
   const deleteItem = useCallback(async (id: string): Promise<boolean> => {
     if (!user) return false;
 
     const previousItems = [...items];
     setItems(prev => prev.filter(item => item.id !== id));
 
     try {
       const { error: deleteError } = await supabase
         .from('items')
         .delete()
         .eq('id', id)
         .eq('user_id', user.id);
 
       if (deleteError) throw deleteError;
       return true;
     } catch (err) {
       console.error('Error deleting item:', err);
        showErrorPopup('Failed to delete item.');
       setItems(previousItems);
       return false;
     }
   }, [user, items]);
 
   // Delete past scheduled items (cleanup)
   const cleanupPastItems = useCallback(async (): Promise<number> => {
     if (!user) return 0;
 
     const today = new Date().toISOString().split('T')[0];
 
     try {
       const { data: pastItems, error: fetchError } = await supabase
         .from('items')
         .select('id')
         .eq('user_id', user.id)
         .in('sub_category', ['scheduling', 'todo'])
         .not('scheduled_date', 'is', null)
         .lt('scheduled_date', today);
 
       if (fetchError) throw fetchError;
       if (!pastItems || pastItems.length === 0) return 0;
 
       const ids = pastItems.map(i => i.id);
 
       const { error: deleteError } = await supabase
         .from('items')
         .delete()
         .in('id', ids)
         .eq('user_id', user.id);
 
       if (deleteError) throw deleteError;
 
       setItems(prev => prev.filter(item => !ids.includes(item.id)));
       return ids.length;
     } catch (err) {
       console.error('Error cleaning up past items:', err);
       return 0;
     }
   }, [user]);
 
   return {
     items,
     loading,
     error,
     createItem,
     updateItem,
     deleteItem,
     cleanupPastItems,
     refetch: fetchItems,
   };
 }
 
 // Hook for user preferences
 export function useCloudPreferences() {
   const { user } = useAuth();
   const [preferences, setPreferences] = useState<DbUserPreferences | null>(null);
   const [loading, setLoading] = useState(true);
 
   const fetchPreferences = useCallback(async () => {
     if (!user) {
       setPreferences(null);
       setLoading(false);
       return;
     }
 
     try {
       const { data, error: fetchError } = await supabase
         .from('user_preferences')
         .select('*')
         .eq('user_id', user.id)
         .maybeSingle();
 
       if (fetchError) throw fetchError;
 
       if (!data) {
         // Create default preferences if none exist
         const { data: newData, error: insertError } = await supabase
           .from('user_preferences')
           .insert({ user_id: user.id })
           .select()
           .single();
 
         if (insertError) throw insertError;
         setPreferences(newData as DbUserPreferences);
       } else {
         setPreferences(data as DbUserPreferences);
       }
     } catch (err) {
       console.error('Error fetching preferences:', err);
     } finally {
       setLoading(false);
     }
   }, [user]);
 
   useEffect(() => {
     fetchPreferences();
   }, [fetchPreferences]);
 
   const updatePreferences = useCallback(async (
     updates: Partial<Pick<DbUserPreferences, 'ai_settings' | 'theme' | 'last_cleanup_date'>>
   ): Promise<boolean> => {
     if (!user || !preferences) return false;
 
     setPreferences(prev => prev ? { ...prev, ...updates } : prev);
 
     try {
       const { error: updateError } = await supabase
         .from('user_preferences')
         .update(updates)
         .eq('user_id', user.id);
 
       if (updateError) throw updateError;
       return true;
     } catch (err) {
       console.error('Error updating preferences:', err);
       await fetchPreferences();
       return false;
     }
   }, [user, preferences, fetchPreferences]);
 
   return {
     preferences,
     loading,
     updatePreferences,
     refetch: fetchPreferences,
   };
 }