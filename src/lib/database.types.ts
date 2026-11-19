
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"group_id": string,"id": number,"payload": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"group_id": string,"id"?: never,"payload"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"group_id"?: string,"id"?: never,"payload"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_log_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_payers": {
                  Row: {
                    "amount_paise": number,"expense_id": string,"member_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"expense_id": string,"member_id": string
                  }
                  Update: {
                    "amount_paise"?: number,"expense_id"?: string,"member_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_payers_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_payers_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_payers_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"expense_splits": {
                  Row: {
                    "amount_paise": number,"expense_id": string,"member_id": string,"share_input": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"expense_id": string,"member_id": string,"share_input"?: number | null
                  }
                  Update: {
                    "amount_paise"?: number,"expense_id"?: string,"member_id"?: string,"share_input"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_splits_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_splits_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_splits_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "member_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount_paise": number,"category": string | null,"created_at": string,"created_by": string,"deleted_at": string | null,"description": string,"expense_date": string,"group_id": string,"id": string,"split_type": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"category"?: string | null,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"description": string,"expense_date"?: string,"group_id": string,"id"?: string,"split_type": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_paise"?: number,"category"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"description"?: string,"expense_date"?: string,"group_id"?: string,"id"?: string,"split_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                },"group_members": {
                  Row: {
                    "added_by": string | null,"display_name": string,"group_id": string,"id": string,"joined_at": string,"left_at": string | null,"role": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "added_by"?: string | null,"display_name": string,"group_id": string,"id"?: string,"joined_at"?: string,"left_at"?: string | null,"role"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "added_by"?: string | null,"display_name"?: string,"group_id"?: string,"id"?: string,"joined_at"?: string,"left_at"?: string | null,"role"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "group_members_added_by_fkey"
      columns: ["added_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "group_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"groups": {
                  Row: {
                    "archived_at": string | null,"created_at": string,"created_by": string,"id": string,"invite_code": string,"name": string,"simplify_debts": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by": string,"id"?: string,"invite_code"?: string,"name": string,"simplify_debts"?: boolean
                  }
                  Update: {
                    "archived_at"?: string | null,"created_at"?: string,"created_by"?: string,"id"?: string,"invite_code"?: string,"name"?: string,"simplify_debts"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"display_name": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name": string,"id": string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"display_name"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settlements": {
                  Row: {
                    "amount_paise": number,"created_at": string,"created_by": string,"deleted_at": string | null,"from_member": string,"group_id": string,"id": string,"note": string | null,"settled_on": string,"to_member": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paise": number,"created_at"?: string,"created_by": string,"deleted_at"?: string | null,"from_member": string,"group_id": string,"id"?: string,"note"?: string | null,"settled_on"?: string,"to_member": string
                  }
                  Update: {
                    "amount_paise"?: number,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"from_member"?: string,"group_id"?: string,"id"?: string,"note"?: string | null,"settled_on"?: string,"to_member"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_from_member_fkey"
      columns: ["from_member"]
isOneToOne: false
      referencedRelation: "member_balances"
      referencedColumns: ["member_id"]
    },{
      foreignKeyName: "settlements_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "group_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_to_member_fkey"
      columns: ["to_member"]
isOneToOne: false
      referencedRelation: "member_balances"
      referencedColumns: ["member_id"]
    }
                  ]
                }
          }
          Views: {
            "member_balances": {
                  Row: {
                    "group_id": string,"member_id": string,"net_paise": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "group_id"?: string | null,"member_id"?: string | null,"net_paise"?: never
                         }
                        Update: {
                           "group_id"?: string | null,"member_id"?: string | null,"net_paise"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "groups"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "_log":
{ Args: { "p_action": string,"p_entity_id": string,"p_entity_type": string,"p_group_id": string,"p_payload": Json }; Returns: undefined
                           },
"_require_user":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"_write_expense_lines":
{ Args: { "p_amount": number,"p_expense_id": string,"p_group_id": string,"p_payers": Json,"p_splits": Json }; Returns: undefined
                           },
"add_placeholder_member":
{ Args: { "p_display_name": string,"p_group_id": string }; Returns: string
                           },
"create_expense":
{ Args: { "p_amount_paise": number,"p_category": string,"p_description": string,"p_expense_date": string,"p_group_id": string,"p_payers": Json,"p_split_type": string,"p_splits": Json }; Returns: string
                           },
"create_group":
{ Args: { "p_name": string }; Returns: string
                           },
"delete_expense":
{ Args: { "p_expense_id": string }; Returns: undefined
                           },
"delete_settlement":
{ Args: { "p_settlement_id": string }; Returns: undefined
                           },
"get_invite_preview":
{ Args: { "p_invite_code": string }; Returns: Json
                           },
"is_group_admin":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"is_group_member":
{ Args: { "p_group_id": string }; Returns: boolean
                           },
"join_group":
{ Args: { "p_claim_member_id"?: string,"p_invite_code": string }; Returns: string
                           },
"record_settlement":
{ Args: { "p_amount_paise": number,"p_from_member": string,"p_group_id": string,"p_note"?: string,"p_settled_on"?: string,"p_to_member": string }; Returns: string
                           },
"shares_group_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"unclaim_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"update_expense":
{ Args: { "p_amount_paise": number,"p_category": string,"p_description": string,"p_expense_date": string,"p_expense_id": string,"p_payers": Json,"p_split_type": string,"p_splits": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
