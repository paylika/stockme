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
      favorites: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          city: string
          colors: string[]
          created_at: string
          description: string | null
          dropshipping: boolean
          id: string
          images: string[]
          moq: number
          name: string
          owner_id: string
          price_fcfa: number
          promo_price_fcfa: number | null
          published: boolean
          quantity: number
          revenue_fcfa: number | null
          sizes: string[]
          sold_out: boolean
          updated_at: string
          weight_grams: number | null
          whatsapp: string | null
          zone: string | null
        }
        Insert: {
          category: string
          city: string
          colors?: string[]
          created_at?: string
          description?: string | null
          dropshipping?: boolean
          id?: string
          images?: string[]
          moq?: number
          name: string
          owner_id: string
          price_fcfa: number
          promo_price_fcfa?: number | null
          published?: boolean
          quantity?: number
          revenue_fcfa?: number | null
          sizes?: string[]
          sold_out?: boolean
          updated_at?: string
          weight_grams?: number | null
          whatsapp?: string | null
          zone?: string | null
        }
        Update: {
          category?: string
          city?: string
          colors?: string[]
          created_at?: string
          description?: string | null
          dropshipping?: boolean
          id?: string
          images?: string[]
          moq?: number
          name?: string
          owner_id?: string
          price_fcfa?: number
          promo_price_fcfa?: number | null
          published?: boolean
          quantity?: number
          revenue_fcfa?: number | null
          sizes?: string[]
          sold_out?: boolean
          updated_at?: string
          weight_grams?: number | null
          whatsapp?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          role: string
          shop_name: string | null
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_until: string | null
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: string
          shop_name?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_until?: string | null
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: string
          shop_name?: string | null
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_until?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ads: {
        Row: {
          active: boolean
          created_at: string
          cta_label: string | null
          description: string | null
          ends_at: string | null
          href: string | null
          id: string
          image_url: string | null
          kind: string
          product_id: string | null
          starts_at: string
          title: string | null
          weight: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          cta_label?: string | null
          description?: string | null
          ends_at?: string | null
          href?: string | null
          id?: string
          image_url?: string | null
          kind: string
          product_id?: string | null
          starts_at?: string
          title?: string | null
          weight?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          cta_label?: string | null
          description?: string | null
          ends_at?: string | null
          href?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          product_id?: string | null
          starts_at?: string
          title?: string | null
          weight?: number
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_fcfa: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_fcfa?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_fcfa?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_fcfa: number
          created_at: string
          id: string
          kind: string
          label: string | null
          user_id: string
        }
        Insert: {
          amount_fcfa: number
          created_at?: string
          id?: string
          kind: string
          label?: string | null
          user_id: string
        }
        Update: {
          amount_fcfa?: number
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount_fcfa: number
          checkout_url: string | null
          created_at: string
          id: string
          metadata: Record<string, unknown>
          method: string | null
          paid_at: string | null
          provider: string
          provider_payload: Record<string, unknown> | null
          provider_ref: string | null
          purpose: string
          status: string
          user_id: string
        }
        Insert: {
          amount_fcfa: number
          checkout_url?: string | null
          created_at?: string
          id?: string
          metadata?: Record<string, unknown>
          method?: string | null
          paid_at?: string | null
          provider: string
          provider_payload?: Record<string, unknown> | null
          provider_ref?: string | null
          purpose: string
          status?: string
          user_id: string
        }
        Update: {
          amount_fcfa?: number
          checkout_url?: string | null
          created_at?: string
          id?: string
          metadata?: Record<string, unknown>
          method?: string | null
          paid_at?: string | null
          provider?: string
          provider_payload?: Record<string, unknown> | null
          provider_ref?: string | null
          purpose?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      boost_campaigns: {
        Row: {
          ad_id: string | null
          created_at: string
          daily_budget_fcfa: number
          days_served: number
          id: string
          last_run_at: string | null
          product_id: string
          status: string
          total_spent_fcfa: number
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          created_at?: string
          daily_budget_fcfa?: number
          days_served?: number
          id?: string
          last_run_at?: string | null
          product_id: string
          status?: string
          total_spent_fcfa?: number
          user_id: string
        }
        Update: {
          ad_id?: string | null
          created_at?: string
          daily_budget_fcfa?: number
          days_served?: number
          id?: string
          last_run_at?: string | null
          product_id?: string
          status?: string
          total_spent_fcfa?: number
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      payment_create_intent: {
        Args: {
          p_purpose: string
          p_amount: number
          p_provider: string
          p_method?: string | null
          p_metadata?: Record<string, unknown>
        }
        Returns: {
          intent_id: string
          amount_fcfa: number
          purpose: string
        }
      }
      payment_attach_checkout: {
        Args: {
          p_intent_id: string
          p_provider_ref: string
          p_checkout_url: string
        }
        Returns: undefined
      }
      payment_mark_paid: {
        Args: {
          p_provider: string
          p_provider_ref: string
          p_amount?: number | null
          p_payload?: Record<string, unknown> | null
          p_subscription_ref?: string | null
        }
        Returns: Record<string, unknown>
      }
      subscription_renew: {
        Args: {
          p_provider: string
          p_subscription_ref: string
          p_amount?: number | null
          p_payload?: Record<string, unknown> | null
        }
        Returns: Record<string, unknown>
      }
      wallet_overview: {
        Args: Record<string, never>
        Returns: {
          balance_fcfa: number
          transactions: {
            amount_fcfa: number
            kind: string
            label: string | null
            created_at: string
          }[]
          boosts: {
            id: string
            product_id: string
            product_name: string | null
            images: string[] | null
            status: string
            daily_budget_fcfa: number
            days_served: number
            total_spent_fcfa: number
            created_at: string
            impressions: number
            clicks: number
            product_views: number
            product_contacts: number
          }[]
          pending: {
            id: string
            purpose: string
            amount_fcfa: number
            provider: string
            method: string | null
            checkout_url: string | null
            created_at: string
          }[]
        }
      }
      payment_cancel_pending: {
        Args: {
          p_purpose: string
          p_min_age_seconds?: number
        }
        Returns: {
          ok: boolean
          cancelled: number
        }
      }
      grant_verification_bonus: {
        Args: {
          p_user_id: string
          p_amount_fcfa?: number
        }
        Returns: Record<string, unknown>
      }
      boost_run_daily: {
        Args: Record<string, never>
        Returns: Record<string, unknown>
      }
      boost_start: {
        Args: {
          p_product_id: string
          p_daily_budget?: number
        }
        Returns: Record<string, unknown>
      }
      boost_set_status: {
        Args: {
          p_campaign_id: string
          p_status: string
        }
        Returns: Record<string, unknown>
      }
      admin_payments_overview: {
        Args: Record<string, never>
        Returns: Record<string, unknown>
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_product_event: {
        Args: {
          p_product_id: string
          p_event: string
          p_country?: string | null
        }
        Returns: undefined
      }
      get_seller_stats: {
        Args: {
          p_seller_id: string
        }
        Returns: {
          total_products: number
          total_views: number
          total_contacts: number
          total_favorites: number
          stock_value: number
          countries: { country: string | null; value: number }[]
          trend: { day: string; value: number }[]
        }
      }
      get_all_seller_stats: {
        Args: Record<string, never>
        Returns: {
          seller_id: string
          products: number
          views: number
          contacts: number
          favorites: number
          stock_value: number
        }[]
      }
      set_user_role: {
        Args: {
          p_user_id: string
          p_role: string
        }
        Returns: undefined
      }
      admin_list_users: {
        Args: Record<string, never>
        Returns: {
          id: string
          email: string | null
          full_name: string | null
          phone: string | null
          whatsapp: string | null
          city: string | null
          role: string | null
          created_at: string
          is_admin: boolean
        }[]
      }
      get_platform_stats: {
        Args: Record<string, never>
        Returns: {
          views: number
          contacts: number
          favorites: number
        }
      }
      log_site_visit: {
        Args: {
          p_path?: string | null
          p_country?: string | null
        }
        Returns: undefined
      }
      get_admin_overview: {
        Args: {
          p_start: string
          p_end: string
          p_unit?: string
        }
        Returns: {
          totals: {
            users: number
            products: number
            published_products: number
            active_sellers: number
            sellers: number
            views: number
            contacts: number
            visits: number
            favorites: number
            stock_value: number
            promos: number
            avg_products_per_seller: number
          }
          period_stats: {
            new_users: number
            new_products: number
            views: number
            contacts: number
            visits: number
            signup_rate: number
            conversion_rate: number
          }
          trend: { day: string; signups: number; views: number; contacts: number; visits: number }[]
          contacts_by_country: { country: string | null; value: number }[]
          top_categories: { name: string; value: number }[]
        }
      }
      get_ranked_products: {
        Args: {
          p_sort?: string
          p_limit?: number
          p_offset?: number
          p_city?: string | null
          p_cities?: string[] | null
          p_category?: string | null
          p_q?: string | null
          p_verified_only?: boolean
        }
        Returns: {
          id: string
          name: string
          category: string
          price_fcfa: number
          promo_price_fcfa: number | null
          quantity: number
          moq: number
          city: string
          zone: string | null
          images: string[]
          sold_out: boolean
          dropshipping: boolean
          owner_id: string
          seller_verified: boolean
          is_boosted: boolean
          score: number
          contacts_total: number
          views_30: number
          favorites: number
        }[]
      }
      get_similar_products: {
        Args: {
          p_product_id: string
          p_limit?: number
        }
        Returns: {
          id: string
          name: string
          category: string
          price_fcfa: number
          promo_price_fcfa: number | null
          city: string
          zone: string | null
          images: string[]
          sold_out: boolean
          dropshipping: boolean
          owner_id: string
          seller_verified: boolean
          views: number
          contacts: number
          favorites: number
        }[]
      }
      get_winner_products: {
        Args: {
          p_limit?: number
        }
        Returns: {
          id: string
          name: string
          category: string
          price_fcfa: number
          promo_price_fcfa: number | null
          quantity: number
          moq: number
          city: string
          zone: string | null
          images: string[]
          sold_out: boolean
          dropshipping: boolean
          contacts: number
          views: number
          favorites: number
        }[]
      }
      get_active_ads: {
        Args: Record<string, never>
        Returns: {
          id: string
          kind: string
          title: string | null
          description: string | null
          image_url: string | null
          cta_label: string | null
          href: string | null
          weight: number
          starts_at: string
          ends_at: string | null
          product_id: string | null
          product_name: string | null
          product_images: string[] | null
          product_city: string | null
          product_zone: string | null
          product_category: string | null
          moq: number | null
          quantity: number | null
          price_fcfa: number | null
          promo_price_fcfa: number | null
          dropshipping: boolean | null
          sold_out: boolean | null
        }[]
      }
      get_ad_stats: {
        Args: Record<string, never>
        Returns: {
          ad_id: string
          impressions: number
          clicks: number
          impressions_7d: number
          clicks_7d: number
          last_event_at: string | null
        }[]
      }
      get_sponsored_products: {
        Args: {
          p_limit?: number
        }
        Returns: {
          ad_id: string
          id: string
          name: string
          category: string
          price_fcfa: number
          promo_price_fcfa: number | null
          quantity: number
          moq: number
          city: string
          zone: string | null
          images: string[]
          sold_out: boolean
          dropshipping: boolean
        }[]
      }
      log_ad_event: {
        Args: {
          p_ad_id: string
          p_event: string
        }
        Returns: undefined
      }
      admin_update_product: {
        Args: {
          p_id: string
          p_patch: Record<string, unknown>
        }
        Returns: Record<string, unknown>
      }
      admin_delete_product: {
        Args: {
          p_id: string
        }
        Returns: undefined
      }
      admin_list_user_products: {
        Args: {
          p_user_id: string
        }
        Returns: {
          id: string
          name: string
          category: string
          city: string
          price_fcfa: number
          promo_price_fcfa: number | null
          quantity: number
          moq: number
          images: string[]
          published: boolean
          sold_out: boolean
          dropshipping: boolean
          created_at: string
          views: number
          contacts: number
          favorites: number
        }[]
      }
      get_public_seller: {
        Args: {
          p_seller_id: string
        }
        Returns: {
          id: string
          shop_name: string | null
          full_name: string | null
          avatar_url: string | null
          city: string | null
          bio: string | null
          created_at: string
          products_count: number
          is_verified: boolean
          verified_until: string | null
          phone: string | null
          whatsapp: string | null
        } | null
      }
      get_verified_sellers: {
        Args: Record<string, never>
        Returns: {
          id: string
          shop_name: string | null
          city: string | null
        }[]
      }
      admin_set_seller_verified: {
        Args: {
          p_user_id: string
          p_months?: number | null
        }
        Returns: Record<string, unknown>
      }
      admin_unset_seller_verified: {
        Args: {
          p_user_id: string
        }
        Returns: Record<string, unknown>
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
