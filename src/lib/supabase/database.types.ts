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
      categories: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      menu_items: {
        Row: {
          category_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      menu_prices: {
        Row: {
          branch_id: string | null;
          created_at: string;
          id: string;
          menu_item_id: string;
          price: string;
          tenant_id: string;
          updated_at: string;
          valid_from: string;
          vat_rate: string;
        };
        Insert: {
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          menu_item_id: string;
          price: string | number;
          tenant_id: string;
          updated_at?: string;
          valid_from?: string;
          vat_rate?: string | number;
        };
        Update: {
          branch_id?: string | null;
          created_at?: string;
          id?: string;
          menu_item_id?: string;
          price?: string | number;
          tenant_id?: string;
          updated_at?: string;
          valid_from?: string;
          vat_rate?: string | number;
        };
        Relationships: [];
      };
      inventory_items: {
        Row: {
          base_unit: string;
          cost_per_base_unit: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          base_unit: string;
          cost_per_base_unit?: string | number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          base_unit?: string;
          cost_per_base_unit?: string | number;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      item_unit_conversions: {
        Row: {
          created_at: string;
          factor: string;
          from_unit: string;
          id: string;
          inventory_item_id: string;
          tenant_id: string;
          to_unit: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          factor: string | number;
          from_unit: string;
          id?: string;
          inventory_item_id: string;
          tenant_id: string;
          to_unit: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          factor?: string | number;
          from_unit?: string;
          id?: string;
          inventory_item_id?: string;
          tenant_id?: string;
          to_unit?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipes: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          menu_item_id: string | null;
          name: string;
          tenant_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          menu_item_id?: string | null;
          name: string;
          tenant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          menu_item_id?: string | null;
          name?: string;
          tenant_id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_versions: {
        Row: {
          activated_at: string | null;
          created_at: string;
          id: string;
          note: string | null;
          recipe_id: string;
          status: Database["public"]["Enums"]["recipe_version_status"];
          tenant_id: string;
          updated_at: string;
          version_no: number;
          yield_quantity: string;
          yield_unit: string;
        };
        Insert: {
          activated_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          recipe_id: string;
          status?: Database["public"]["Enums"]["recipe_version_status"];
          tenant_id: string;
          updated_at?: string;
          version_no: number;
          yield_quantity: string | number;
          yield_unit: string;
        };
        Update: {
          activated_at?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          recipe_id?: string;
          status?: Database["public"]["Enums"]["recipe_version_status"];
          tenant_id?: string;
          updated_at?: string;
          version_no?: number;
          yield_quantity?: string | number;
          yield_unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey";
            columns: ["recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
      };
      recipe_lines: {
        Row: {
          component_type: Database["public"]["Enums"]["recipe_component_type"];
          created_at: string;
          id: string;
          inventory_item_id: string | null;
          line_no: number;
          quantity: string;
          recipe_version_id: string;
          sub_recipe_id: string | null;
          tenant_id: string;
          unit: string;
          updated_at: string;
          waste_percent: string;
        };
        Insert: {
          component_type: Database["public"]["Enums"]["recipe_component_type"];
          created_at?: string;
          id?: string;
          inventory_item_id?: string | null;
          line_no: number;
          quantity: string | number;
          recipe_version_id: string;
          sub_recipe_id?: string | null;
          tenant_id: string;
          unit: string;
          updated_at?: string;
          waste_percent?: string | number;
        };
        Update: {
          component_type?: Database["public"]["Enums"]["recipe_component_type"];
          created_at?: string;
          id?: string;
          inventory_item_id?: string | null;
          line_no?: number;
          quantity?: string | number;
          recipe_version_id?: string;
          sub_recipe_id?: string | null;
          tenant_id?: string;
          unit?: string;
          updated_at?: string;
          waste_percent?: string | number;
        };
        // Bu ilişki tanımı olmadan `recipe_versions(..., recipe_lines(...))`
        // gömülü sorgusu tip çıkarımı yapamıyor.
        Relationships: [
          {
            foreignKeyName: "recipe_lines_recipe_version_id_fkey";
            columns: ["recipe_version_id"];
            isOneToOne: false;
            referencedRelation: "recipe_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_lines_inventory_item_id_fkey";
            columns: ["inventory_item_id"];
            isOneToOne: false;
            referencedRelation: "inventory_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "recipe_lines_sub_recipe_id_fkey";
            columns: ["sub_recipe_id"];
            isOneToOne: false;
            referencedRelation: "recipes";
            referencedColumns: ["id"];
          },
        ];
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
      recipe_version_status: "draft" | "active" | "archived";
      recipe_component_type: "ingredient" | "sub_recipe";
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
