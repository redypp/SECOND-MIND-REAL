export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      archive_sources: {
        Row: {
          created_at: string
          external_id: string | null
          id: string
          imported_at: string | null
          imported_text: string | null
          item_id: string
          source_type: string
          source_url: string
          status: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          external_id?: string | null
          id?: string
          imported_at?: string | null
          imported_text?: string | null
          item_id: string
          source_type?: string
          source_url: string
          status?: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          external_id?: string | null
          id?: string
          imported_at?: string | null
          imported_text?: string | null
          item_id?: string
          source_type?: string
          source_url?: string
          status?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      data_integrity_logs: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_entries: {
        Row: {
          created_at: string
          date: string
          habit_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          habit_id: string
          id?: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          habit_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_entries_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      items: {
        Row: {
          ai_processed: boolean | null
          ai_summary: string | null
          ai_tags: string[] | null
          blocks: Json
          canvas_scale: number | null
          canvas_x: number | null
          canvas_y: number | null
          canvas_z: number | null
          color: string | null
          content: string | null
          created_at: string
          deleted_at: string | null
          extracted_people: string[] | null
          id: string
          item_type: string | null
          keywords: string[] | null
          people_ids: string[] | null
          scheduled_date: string | null
          scheduled_time: string | null
          space_ids: string[] | null
          sub_category: string
          suggested_space: string | null
          thumbnail: string | null
          title: string | null
          updated_at: string
          url: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          ai_processed?: boolean | null
          ai_summary?: string | null
          ai_tags?: string[] | null
          blocks?: Json
          canvas_scale?: number | null
          canvas_x?: number | null
          canvas_y?: number | null
          canvas_z?: number | null
          color?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          extracted_people?: string[] | null
          id?: string
          item_type?: string | null
          keywords?: string[] | null
          people_ids?: string[] | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          space_ids?: string[] | null
          sub_category: string
          suggested_space?: string | null
          thumbnail?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          ai_processed?: boolean | null
          ai_summary?: string | null
          ai_tags?: string[] | null
          blocks?: Json
          canvas_scale?: number | null
          canvas_x?: number | null
          canvas_y?: number | null
          canvas_z?: number | null
          color?: string | null
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          extracted_people?: string[] | null
          id?: string
          item_type?: string | null
          keywords?: string[] | null
          people_ids?: string[] | null
          scheduled_date?: string | null
          scheduled_time?: string | null
          space_ids?: string[] | null
          sub_category?: string
          suggested_space?: string | null
          thumbnail?: string | null
          title?: string | null
          updated_at?: string
          url?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          daily_digest_enabled: boolean
          digest_time: string | null
          email_digest_enabled: boolean
          id: string
          max_daily_notifications: number
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_digest_enabled?: boolean
          digest_time?: string | null
          email_digest_enabled?: boolean
          id?: string
          max_daily_notifications?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_digest_enabled?: boolean
          digest_time?: string | null
          email_digest_enabled?: boolean
          id?: string
          max_daily_notifications?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          dismissed_at: string | null
          id: string
          message: string
          priority: string
          read_at: string | null
          reason: string
          related_item_ids: string[] | null
          scheduled_for: string
          suggested_action: string | null
          title: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          message: string
          priority?: string
          read_at?: string | null
          reason: string
          related_item_ids?: string[] | null
          scheduled_for?: string
          suggested_action?: string | null
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          message?: string
          priority?: string
          read_at?: string | null
          reason?: string
          related_item_ids?: string[] | null
          scheduled_for?: string
          suggested_action?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birthday: string | null
          created_at: string
          full_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          birthday?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          birthday?: string | null
          created_at?: string
          full_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_reminders: {
        Row: {
          created_at: string
          dismissed: boolean
          fired_at: string | null
          id: string
          is_fired: boolean
          message: string
          remind_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed?: boolean
          fired_at?: string | null
          id?: string
          is_fired?: boolean
          message: string
          remind_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed?: boolean
          fired_at?: string | null
          id?: string
          is_fired?: boolean
          message?: string
          remind_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_archive_prototype: {
        Row: {
          author_id: string
          content: string | null
          created_at: string
          id: string
          original_note_id: string
          tags: string[] | null
          title: string | null
          visibility: string
        }
        Insert: {
          author_id: string
          content?: string | null
          created_at?: string
          id?: string
          original_note_id: string
          tags?: string[] | null
          title?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string
          content?: string | null
          created_at?: string
          id?: string
          original_note_id?: string
          tags?: string[] | null
          title?: string | null
          visibility?: string
        }
        Relationships: []
      }
      spaces: {
        Row: {
          color: string | null
          created_at: string
          deleted_at: string | null
          gif_background: string | null
          group_assignments: Json | null
          id: string
          image: string | null
          is_pinned: boolean
          item_count: number
          last_used_at: string
          merged_from: string[] | null
          name: string
          pinned_at: string | null
          position: number
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          gif_background?: string | null
          group_assignments?: Json | null
          id?: string
          image?: string | null
          is_pinned?: boolean
          item_count?: number
          last_used_at?: string
          merged_from?: string[] | null
          name: string
          pinned_at?: string | null
          position?: number
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          gif_background?: string | null
          group_assignments?: Json | null
          id?: string
          image?: string | null
          is_pinned?: boolean
          item_count?: number
          last_used_at?: string
          merged_from?: string[] | null
          name?: string
          pinned_at?: string | null
          position?: number
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          ai_settings: Json
          created_at: string
          id: string
          last_cleanup_date: string | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_settings?: Json
          created_at?: string
          id?: string
          last_cleanup_date?: string | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_settings?: Json
          created_at?: string
          id?: string
          last_cleanup_date?: string | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
