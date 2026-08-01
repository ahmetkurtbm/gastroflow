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
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          after: Json | null
          before: Json | null
          id: number
          occurred_at: string
          record_id: string | null
          table_name: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          record_id?: string | null
          table_name: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after?: Json | null
          before?: Json | null
          id?: never
          occurred_at?: string
          record_id?: string | null
          table_name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          branch_id: string
          closed_at: string | null
          closed_by: string | null
          counted_cash: number | null
          created_at: string
          id: string
          note: string | null
          opened_at: string
          opened_by: string
          opening_float: number
          status: Database["public"]["Enums"]["cash_session_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          id?: string
          note?: string | null
          opened_at?: string
          opened_by: string
          opening_float?: number
          status?: Database["public"]["Enums"]["cash_session_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          closed_at?: string | null
          closed_by?: string | null
          counted_cash?: number | null
          created_at?: string
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string
          opening_float?: number
          status?: Database["public"]["Enums"]["cash_session_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          base_unit: string
          cost_per_base_unit: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_unit: string
          cost_per_base_unit?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_unit?: string
          cost_per_base_unit?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_unit_conversions: {
        Row: {
          created_at: string
          factor: number
          from_unit: string
          id: string
          inventory_item_id: string
          tenant_id: string
          to_unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          factor: number
          from_unit: string
          id?: string
          inventory_item_id: string
          tenant_id: string
          to_unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          factor?: number
          from_unit?: string
          id?: string
          inventory_item_id?: string
          tenant_id?: string
          to_unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_unit_conversions_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_unit_conversions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      line_discounts: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: Database["public"]["Enums"]["line_discount_kind"]
          order_line_id: string
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["line_discount_status"]
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["line_discount_kind"]
          order_line_id: string
          reason: string
          requested_by: string
          status?: Database["public"]["Enums"]["line_discount_status"]
          tenant_id: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["line_discount_kind"]
          order_line_id?: string
          reason?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["line_discount_status"]
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "line_discounts_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_discounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_prices: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          menu_item_id: string
          price: number
          tenant_id: string
          updated_at: string
          valid_from: string
          vat_rate: number
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          menu_item_id: string
          price: number
          tenant_id: string
          updated_at?: string
          valid_from?: string
          vat_rate?: number
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          menu_item_id?: string
          price?: number
          tenant_id?: string
          updated_at?: string
          valid_from?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_prices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_prices_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_prices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number
          menu_item_id: string
          min_select?: number
          name: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          modifier_group_id: string
          name: string
          price_delta: number
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          modifier_group_id: string
          name: string
          price_delta?: number
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          modifier_group_id?: string
          name?: string
          price_delta?: number
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          body: string
          error: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          outbox_id: string | null
          recipient_email: string
          recipient_role: Database["public"]["Enums"]["app_role"] | null
          sent_at: string
          status: Database["public"]["Enums"]["notification_status"]
          subject: string
          tenant_id: string
        }
        Insert: {
          body: string
          error?: string | null
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          outbox_id?: string | null
          recipient_email: string
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          sent_at?: string
          status: Database["public"]["Enums"]["notification_status"]
          subject: string
          tenant_id: string
        }
        Update: {
          body?: string
          error?: string | null
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          outbox_id?: string | null
          recipient_email?: string
          recipient_role?: Database["public"]["Enums"]["app_role"] | null
          sent_at?: string
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "notification_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          payload: Json
          processed_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          tenant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          tenant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          payload?: Json
          processed_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id: string
          is_enabled: boolean
          recipient_roles: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_enabled?: boolean
          recipient_roles?: Database["public"]["Enums"]["app_role"][]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["notification_event_type"]
          id?: string
          is_enabled?: boolean
          recipient_roles?: Database["public"]["Enums"]["app_role"][]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_modifiers: {
        Row: {
          created_at: string
          id: string
          modifier_id: string | null
          name: string
          order_line_id: string
          price_delta: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          modifier_id?: string | null
          name: string
          order_line_id: string
          price_delta: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          modifier_id?: string | null
          name?: string
          order_line_id?: string
          price_delta?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_line_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_modifiers_order_line_id_fkey"
            columns: ["order_line_id"]
            isOneToOne: false
            referencedRelation: "order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_modifiers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          client_key: string
          created_at: string
          created_by: string | null
          id: string
          menu_item_id: string
          note: string | null
          order_id: string
          quantity: number
          ready_at: string | null
          recipe_version_id: string | null
          sent_at: string | null
          station: string | null
          status: Database["public"]["Enums"]["order_line_status"]
          tenant_id: string
          unit_price: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          client_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          menu_item_id: string
          note?: string | null
          order_id: string
          quantity: number
          ready_at?: string | null
          recipe_version_id?: string | null
          sent_at?: string | null
          station?: string | null
          status?: Database["public"]["Enums"]["order_line_status"]
          tenant_id: string
          unit_price: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          client_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          menu_item_id?: string
          note?: string | null
          order_id?: string
          quantity?: number
          ready_at?: string | null
          recipe_version_id?: string | null
          sent_at?: string | null
          station?: string | null
          status?: Database["public"]["Enums"]["order_line_status"]
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string
          channel: Database["public"]["Enums"]["order_channel"]
          client_key: string
          closed_at: string | null
          created_at: string
          guest_count: number | null
          id: string
          note: string | null
          opened_at: string
          opened_by: string | null
          order_no: number | null
          status: Database["public"]["Enums"]["order_status"]
          table_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          channel?: Database["public"]["Enums"]["order_channel"]
          client_key: string
          closed_at?: string | null
          created_at?: string
          guest_count?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          order_no?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          channel?: Database["public"]["Enums"]["order_channel"]
          client_key?: string
          closed_at?: string | null
          created_at?: string
          guest_count?: number | null
          id?: string
          note?: string | null
          opened_at?: string
          opened_by?: string | null
          order_no?: number | null
          status?: Database["public"]["Enums"]["order_status"]
          table_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      par_levels: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          location_id: string
          max_quantity: number | null
          min_quantity: number | null
          reorder_point: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          location_id: string
          max_quantity?: number | null
          min_quantity?: number | null
          reorder_point?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          location_id?: string
          max_quantity?: number | null
          min_quantity?: number | null
          reorder_point?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "par_levels_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          cash_session_id: string | null
          client_key: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          received_at: string
          received_by: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          client_key: string
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          received_at?: string
          received_by?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          client_key?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          received_at?: string
          received_by?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      po_lines: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          po_id: string
          quantity: number
          received_quantity: number | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          po_id: string
          quantity: number
          received_quantity?: number | null
          tenant_id: string
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          po_id?: string
          quantity?: number
          received_quantity?: number | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          branch_id: string
          client_key: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          note: string | null
          received_at: string | null
          received_by: string | null
          requested_at: string
          requested_by: string
          status: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          client_key: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          client_key?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          note?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["purchase_order_status"]
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_lines: {
        Row: {
          component_type: Database["public"]["Enums"]["recipe_component_type"]
          created_at: string
          id: string
          inventory_item_id: string | null
          line_no: number
          quantity: number
          recipe_version_id: string
          sub_recipe_id: string | null
          tenant_id: string
          unit: string
          updated_at: string
          waste_percent: number
        }
        Insert: {
          component_type: Database["public"]["Enums"]["recipe_component_type"]
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          line_no: number
          quantity: number
          recipe_version_id: string
          sub_recipe_id?: string | null
          tenant_id: string
          unit: string
          updated_at?: string
          waste_percent?: number
        }
        Update: {
          component_type?: Database["public"]["Enums"]["recipe_component_type"]
          created_at?: string
          id?: string
          inventory_item_id?: string | null
          line_no?: number
          quantity?: number
          recipe_version_id?: string
          sub_recipe_id?: string | null
          tenant_id?: string
          unit?: string
          updated_at?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_lines_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_lines_recipe_version_id_fkey"
            columns: ["recipe_version_id"]
            isOneToOne: false
            referencedRelation: "recipe_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_lines_sub_recipe_id_fkey"
            columns: ["sub_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_versions: {
        Row: {
          activated_at: string | null
          created_at: string
          id: string
          note: string | null
          recipe_id: string
          status: Database["public"]["Enums"]["recipe_version_status"]
          tenant_id: string
          updated_at: string
          version_no: number
          yield_quantity: number
          yield_unit: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          recipe_id: string
          status?: Database["public"]["Enums"]["recipe_version_status"]
          tenant_id: string
          updated_at?: string
          version_no: number
          yield_quantity: number
          yield_unit: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          recipe_id?: string
          status?: Database["public"]["Enums"]["recipe_version_status"]
          tenant_id?: string
          updated_at?: string
          version_no?: number
          yield_quantity?: number
          yield_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_versions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          menu_item_id: string | null
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_item_id?: string | null
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          menu_item_id?: string | null
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["stock_location_kind"]
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["stock_location_kind"]
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["stock_location_kind"]
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          note: string | null
          quantity: number
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          waste_reason: Database["public"]["Enums"]["waste_reason"] | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          note?: string | null
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          waste_reason?: Database["public"]["Enums"]["waste_reason"] | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          location_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          note?: string | null
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          waste_reason?: Database["public"]["Enums"]["waste_reason"] | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          min_order_quantity: number
          price: number
          supplier_id: string
          supplier_sku: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          min_order_quantity?: number
          price: number
          supplier_id: string
          supplier_sku?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          min_order_quantity?: number
          price?: number
          supplier_id?: string
          supplier_sku?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          lead_time_days: number
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          lead_time_days?: number
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          area_id: string | null
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          seats: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          seats?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          seats?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_low_stock: {
        Row: {
          balance: number | null
          base_unit: string | null
          inventory_item_id: string | null
          item_name: string | null
          location_id: string | null
          location_name: string | null
          reorder_point: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "par_levels_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_levels_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "par_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_balance: {
        Row: {
          balance: number | null
          branch_id: string | null
          inventory_item_id: string | null
          location_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_read_costs: { Args: never; Returns: boolean }
      can_read_purchasing: { Args: never; Returns: boolean }
      can_read_stock: { Args: never; Returns: boolean }
      can_write_purchasing: { Args: never; Returns: boolean }
      can_write_stock: { Args: never; Returns: boolean }
      current_app_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_branch_id: { Args: never; Returns: string }
      current_tenant_id: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      enqueue_notification: {
        Args: {
          p_dedup_key?: string
          p_dedup_window?: string
          p_event_type: Database["public"]["Enums"]["notification_event_type"]
          p_payload: Json
          p_tenant_id: string
        }
        Returns: undefined
      }
      enqueue_weekly_cost_reports: { Args: never; Returns: undefined }
      is_manager: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role:
        | "owner"
        | "manager"
        | "chef"
        | "waiter"
        | "cashier"
        | "storekeeper"
        | "accountant"
      cash_session_status: "open" | "closed"
      line_discount_kind: "comp" | "percent" | "amount"
      line_discount_status: "pending" | "approved" | "rejected"
      notification_event_type:
        | "low_stock"
        | "negative_stock"
        | "approval_pending"
        | "po_approved"
        | "cash_shortage"
        | "day_end_summary"
        | "weekly_cost_report"
      notification_status: "pending" | "sent" | "failed"
      order_channel: "dine_in" | "takeaway" | "delivery"
      order_line_status:
        | "pending"
        | "sent"
        | "preparing"
        | "ready"
        | "served"
        | "cancelled"
      order_status: "open" | "closed" | "cancelled"
      payment_method: "cash" | "card" | "meal_card" | "on_account"
      purchase_order_status:
        | "pending_approval"
        | "approved"
        | "rejected"
        | "received"
        | "cancelled"
      recipe_component_type: "ingredient" | "sub_recipe"
      recipe_version_status: "draft" | "active" | "archived"
      stock_location_kind: "storage" | "kitchen" | "bar"
      stock_movement_type:
        | "purchase_in"
        | "sale_out"
        | "waste"
        | "transfer_in"
        | "transfer_out"
        | "production_in"
        | "production_out"
        | "count_adjustment"
        | "reversal"
      waste_reason:
        | "spoilage"
        | "prep_error"
        | "dropped"
        | "expired"
        | "customer_return"
        | "other"
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
    Enums: {
      app_role: [
        "owner",
        "manager",
        "chef",
        "waiter",
        "cashier",
        "storekeeper",
        "accountant",
      ],
      cash_session_status: ["open", "closed"],
      line_discount_kind: ["comp", "percent", "amount"],
      line_discount_status: ["pending", "approved", "rejected"],
      notification_event_type: [
        "low_stock",
        "negative_stock",
        "approval_pending",
        "po_approved",
        "cash_shortage",
        "day_end_summary",
        "weekly_cost_report",
      ],
      notification_status: ["pending", "sent", "failed"],
      order_channel: ["dine_in", "takeaway", "delivery"],
      order_line_status: [
        "pending",
        "sent",
        "preparing",
        "ready",
        "served",
        "cancelled",
      ],
      order_status: ["open", "closed", "cancelled"],
      payment_method: ["cash", "card", "meal_card", "on_account"],
      purchase_order_status: [
        "pending_approval",
        "approved",
        "rejected",
        "received",
        "cancelled",
      ],
      recipe_component_type: ["ingredient", "sub_recipe"],
      recipe_version_status: ["draft", "active", "archived"],
      stock_location_kind: ["storage", "kitchen", "bar"],
      stock_movement_type: [
        "purchase_in",
        "sale_out",
        "waste",
        "transfer_in",
        "transfer_out",
        "production_in",
        "production_out",
        "count_adjustment",
        "reversal",
      ],
      waste_reason: [
        "spoilage",
        "prep_error",
        "dropped",
        "expired",
        "customer_return",
        "other",
      ],
    },
  },
} as const
