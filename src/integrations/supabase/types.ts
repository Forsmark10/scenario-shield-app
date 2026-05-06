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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          cost_center_name: string
          created_at: string
          default_unit: string
          id: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          cost_center_name?: string
          created_at?: string
          default_unit?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          cost_center_name?: string
          created_at?: string
          default_unit?: string
          id?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      auto_versions: {
        Row: {
          created_at: string
          data: Json
          id: string
          scenario_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          scenario_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          scenario_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      capex_plan: {
        Row: {
          amount: number
          capex_type: string
          comment: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          depreciation_start_year: number | null
          description: string | null
          id: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          amount?: number
          capex_type: string
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          depreciation_start_year?: number | null
          description?: string | null
          id?: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          amount?: number
          capex_type?: string
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          depreciation_start_year?: number | null
          description?: string | null
          id?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "capex_plan_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      category_adjustments: {
        Row: {
          adjustment_amount_tnok: number
          adjustment_pct: number
          category: string
          comment: string | null
          comment_amount: string | null
          comment_amount_updated_at: string | null
          comment_amount_updated_by: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          id: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          adjustment_amount_tnok?: number
          adjustment_pct?: number
          category: string
          comment?: string | null
          comment_amount?: string | null
          comment_amount_updated_at?: string | null
          comment_amount_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          id?: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          adjustment_amount_tnok?: number
          adjustment_pct?: number
          category?: string
          comment?: string | null
          comment_amount?: string | null
          comment_amount_updated_at?: string | null
          comment_amount_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          id?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "category_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      central_assumptions: {
        Row: {
          central_eur_nok_rate: number
          central_price_increase_pct: number
          central_reduction_amount_tnok: number
          central_reduction_pct: number
          central_volume_increase_pct: number
          comment: string | null
          comment_amount: string | null
          comment_amount_updated_at: string | null
          comment_amount_updated_by: string | null
          comment_rate: string | null
          comment_rate_updated_at: string | null
          comment_rate_updated_by: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          id: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          central_eur_nok_rate?: number
          central_price_increase_pct?: number
          central_reduction_amount_tnok?: number
          central_reduction_pct?: number
          central_volume_increase_pct?: number
          comment?: string | null
          comment_amount?: string | null
          comment_amount_updated_at?: string | null
          comment_amount_updated_by?: string | null
          comment_rate?: string | null
          comment_rate_updated_at?: string | null
          comment_rate_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          id?: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          central_eur_nok_rate?: number
          central_price_increase_pct?: number
          central_reduction_amount_tnok?: number
          central_reduction_pct?: number
          central_volume_increase_pct?: number
          comment?: string | null
          comment_amount?: string | null
          comment_amount_updated_at?: string | null
          comment_amount_updated_by?: string | null
          comment_rate?: string | null
          comment_rate_updated_at?: string | null
          comment_rate_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          id?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "central_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      conversions: {
        Row: {
          comment: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          count: number
          created_at: string
          external_level: string
          id: string
          internal_level: string
          overlap_months: number
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          count?: number
          created_at?: string
          external_level: string
          id?: string
          internal_level: string
          overlap_months?: number
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          count?: number
          created_at?: string
          external_level?: string
          id?: string
          internal_level?: string
          overlap_months?: number
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_lines: {
        Row: {
          ac_2025: number
          account: number
          account_name: string
          bu_2026_monthly: number[]
          category: string
          cost_type: string
          created_at: string
          fc_2026_monthly: number[]
          fte_driver_pct: number | null
          id: string
          is_existing_depreciation_alfa: boolean
          is_existing_depreciation_phaseout: boolean
          is_fte_master: boolean
          project: string
          updated_at: string
        }
        Insert: {
          ac_2025?: number
          account: number
          account_name: string
          bu_2026_monthly?: number[]
          category: string
          cost_type: string
          created_at?: string
          fc_2026_monthly?: number[]
          fte_driver_pct?: number | null
          id?: string
          is_existing_depreciation_alfa?: boolean
          is_existing_depreciation_phaseout?: boolean
          is_fte_master?: boolean
          project: string
          updated_at?: string
        }
        Update: {
          ac_2025?: number
          account?: number
          account_name?: string
          bu_2026_monthly?: number[]
          category?: string
          cost_type?: string
          created_at?: string
          fc_2026_monthly?: number[]
          fte_driver_pct?: number | null
          id?: string
          is_existing_depreciation_alfa?: boolean
          is_existing_depreciation_phaseout?: boolean
          is_fte_master?: boolean
          project?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_lines_backups: {
        Row: {
          created_at: string
          data: Json
          id: string
          name: string
          row_count: number
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          name: string
          row_count?: number
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          name?: string
          row_count?: number
        }
        Relationships: []
      }
      depreciation_phaseout: {
        Row: {
          amount_tnok: number
          comment: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          id: string
          scenario_id: string
          type: string
          updated_at: string
          year: number
        }
        Insert: {
          amount_tnok?: number
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          id?: string
          scenario_id: string
          type: string
          updated_at?: string
          year: number
        }
        Update: {
          amount_tnok?: number
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          id?: string
          scenario_id?: string
          type?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      depreciation_rules: {
        Row: {
          capex_type: string
          created_at: string
          depreciation_years: number
          id: string
          updated_at: string
        }
        Insert: {
          capex_type: string
          created_at?: string
          depreciation_years: number
          id?: string
          updated_at?: string
        }
        Update: {
          capex_type?: string
          created_at?: string
          depreciation_years?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_fte_base_rates: {
        Row: {
          base_monthly_cost: number
          created_at: string
          id: string
          level: string
          updated_at: string
          working_months: number
        }
        Insert: {
          base_monthly_cost: number
          created_at?: string
          id?: string
          level: string
          updated_at?: string
          working_months?: number
        }
        Update: {
          base_monthly_cost?: number
          created_at?: string
          id?: string
          level?: string
          updated_at?: string
          working_months?: number
        }
        Relationships: []
      }
      external_fte_changes: {
        Row: {
          comment: string | null
          comment_decrease: string | null
          comment_decrease_updated_at: string | null
          comment_decrease_updated_by: string | null
          comment_increase: string | null
          comment_increase_updated_at: string | null
          comment_increase_updated_by: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          decrease: number
          id: string
          increase: number
          level: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_decrease?: string | null
          comment_decrease_updated_at?: string | null
          comment_decrease_updated_by?: string | null
          comment_increase?: string | null
          comment_increase_updated_at?: string | null
          comment_increase_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          decrease?: number
          id?: string
          increase?: number
          level: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_decrease?: string | null
          comment_decrease_updated_at?: string | null
          comment_decrease_updated_by?: string | null
          comment_increase?: string | null
          comment_increase_updated_at?: string | null
          comment_increase_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          decrease?: number
          id?: string
          increase?: number
          level?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "external_fte_changes_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_snapshots: {
        Row: {
          created_at: string
          data: Json
          description: string | null
          id: string
          name: string
          scenario_id: string
          snapshot_group_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          description?: string | null
          id?: string
          name: string
          scenario_id: string
          snapshot_group_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          description?: string | null
          id?: string
          name?: string
          scenario_id?: string
          snapshot_group_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_snapshots_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      global_assumptions: {
        Row: {
          comment: string | null
          comment_price: string | null
          comment_price_updated_at: string | null
          comment_price_updated_by: string | null
          comment_rate: string | null
          comment_rate_updated_at: string | null
          comment_rate_updated_by: string | null
          comment_salary: string | null
          comment_salary_updated_at: string | null
          comment_salary_updated_by: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          eur_nok_rate: number
          id: string
          price_increase_pct: number
          salary_increase_pct: number
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_price?: string | null
          comment_price_updated_at?: string | null
          comment_price_updated_by?: string | null
          comment_rate?: string | null
          comment_rate_updated_at?: string | null
          comment_rate_updated_by?: string | null
          comment_salary?: string | null
          comment_salary_updated_at?: string | null
          comment_salary_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          eur_nok_rate?: number
          id?: string
          price_increase_pct?: number
          salary_increase_pct?: number
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_price?: string | null
          comment_price_updated_at?: string | null
          comment_price_updated_by?: string | null
          comment_rate?: string | null
          comment_rate_updated_at?: string | null
          comment_rate_updated_by?: string | null
          comment_salary?: string | null
          comment_salary_updated_at?: string | null
          comment_salary_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          eur_nok_rate?: number
          id?: string
          price_increase_pct?: number
          salary_increase_pct?: number
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "global_assumptions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_fte_base_rates: {
        Row: {
          base_annual_cost: number
          created_at: string
          id: string
          level: string
          updated_at: string
        }
        Insert: {
          base_annual_cost: number
          created_at?: string
          id?: string
          level: string
          updated_at?: string
        }
        Update: {
          base_annual_cost?: number
          created_at?: string
          id?: string
          level?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_fte_changes: {
        Row: {
          comment: string | null
          comment_decrease: string | null
          comment_decrease_updated_at: string | null
          comment_decrease_updated_by: string | null
          comment_increase: string | null
          comment_increase_updated_at: string | null
          comment_increase_updated_by: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          decrease: number
          id: string
          increase: number
          level: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_decrease?: string | null
          comment_decrease_updated_at?: string | null
          comment_decrease_updated_by?: string | null
          comment_increase?: string | null
          comment_increase_updated_at?: string | null
          comment_increase_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          decrease?: number
          id?: string
          increase?: number
          level: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_decrease?: string | null
          comment_decrease_updated_at?: string | null
          comment_decrease_updated_by?: string | null
          comment_increase?: string | null
          comment_increase_updated_at?: string | null
          comment_increase_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          decrease?: number
          id?: string
          increase?: number
          level?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "internal_fte_changes_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_to_nearshoring_conversions: {
        Row: {
          comment: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          count: number
          created_at: string
          id: string
          internal_level: string
          overlap_months: number
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          count?: number
          created_at?: string
          id?: string
          internal_level: string
          overlap_months?: number
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          count?: number
          created_at?: string
          id?: string
          internal_level?: string
          overlap_months?: number
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      nearshoring_additions: {
        Row: {
          comment: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          count: number
          created_at: string
          id: string
          overlap_months: number
          replaces_external_level: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          count?: number
          created_at?: string
          id?: string
          overlap_months?: number
          replaces_external_level: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          count?: number
          created_at?: string
          id?: string
          overlap_months?: number
          replaces_external_level?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "nearshoring_additions_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      nearshoring_base: {
        Row: {
          base_annual_cost_eur: number
          created_at: string
          id: string
          updated_at: string
          working_months: number
        }
        Insert: {
          base_annual_cost_eur?: number
          created_at?: string
          id?: string
          updated_at?: string
          working_months?: number
        }
        Update: {
          base_annual_cost_eur?: number
          created_at?: string
          id?: string
          updated_at?: string
          working_months?: number
        }
        Relationships: []
      }
      nearshoring_changes: {
        Row: {
          comment: string | null
          comment_decrease: string | null
          comment_decrease_updated_at: string | null
          comment_decrease_updated_by: string | null
          comment_increase: string | null
          comment_increase_updated_at: string | null
          comment_increase_updated_by: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          decrease: number
          id: string
          increase: number
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          comment?: string | null
          comment_decrease?: string | null
          comment_decrease_updated_at?: string | null
          comment_decrease_updated_by?: string | null
          comment_increase?: string | null
          comment_increase_updated_at?: string | null
          comment_increase_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          decrease?: number
          id?: string
          increase?: number
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          comment?: string | null
          comment_decrease?: string | null
          comment_decrease_updated_at?: string | null
          comment_decrease_updated_by?: string | null
          comment_increase?: string | null
          comment_increase_updated_at?: string | null
          comment_increase_updated_by?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          decrease?: number
          id?: string
          increase?: number
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      one_off_effects: {
        Row: {
          amount_tnok: number
          category: string
          comment: string | null
          comment_updated_at: string | null
          comment_updated_by: string | null
          created_at: string
          description: string | null
          id: string
          scenario_id: string
          updated_at: string
          year: number
        }
        Insert: {
          amount_tnok?: number
          category: string
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scenario_id: string
          updated_at?: string
          year: number
        }
        Update: {
          amount_tnok?: number
          category?: string
          comment?: string | null
          comment_updated_at?: string | null
          comment_updated_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          scenario_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      scenarios: {
        Row: {
          ai_executive_summary: string | null
          ai_executive_summary_generated_at: string | null
          created_at: string
          description: string | null
          executive_summary: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          ai_executive_summary?: string | null
          ai_executive_summary_generated_at?: string | null
          created_at?: string
          description?: string | null
          executive_summary?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          ai_executive_summary?: string | null
          ai_executive_summary_generated_at?: string | null
          created_at?: string
          description?: string | null
          executive_summary?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      prune_old_auto_versions: { Args: never; Returns: undefined }
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
