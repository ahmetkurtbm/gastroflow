/**
 * ÜRETİLEN DOSYA — elle düzenleme.
 *
 * Şema değiştiğinde yeniden üret:
 *   supabase gen types typescript --project-id fzshndeywcvjktvahdab > src/lib/supabase/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_role: Database["public"]["Enums"]["app_role"] | null;
          after: Json | null;
          before: Json | null;
          id: number;
          occurred_at: string;
          record_id: string | null;
          table_name: string;
          tenant_id: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          after?: Json | null;
          before?: Json | null;
          id?: never;
          occurred_at?: string;
          record_id?: string | null;
          table_name: string;
          tenant_id: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_role?: Database["public"]["Enums"]["app_role"] | null;
          after?: Json | null;
          before?: Json | null;
          id?: never;
          occurred_at?: string;
          record_id?: string | null;
          table_name?: string;
          tenant_id?: string;
        };
        Relationships: [];
      };
      branches: {
        Row: {
          created_at: string;
          currency: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      memberships: {
        Row: {
          branch_id: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          role: Database["public"]["Enums"]["app_role"];
          tenant_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          role?: Database["public"]["Enums"]["app_role"];
          tenant_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          id: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          full_name: string;
          id: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          id?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      tenants: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          slug: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      current_app_role: {
        Args: never;
        Returns: Database["public"]["Enums"]["app_role"];
      };
      current_branch_id: { Args: never; Returns: string };
      current_tenant_id: { Args: never; Returns: string };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      is_manager: { Args: never; Returns: boolean };
      is_owner: { Args: never; Returns: boolean };
    };
    Enums: {
      app_role:
        | "owner"
        | "manager"
        | "chef"
        | "waiter"
        | "cashier"
        | "storekeeper"
        | "accountant";
    };
    CompositeTypes: Record<never, never>;
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
