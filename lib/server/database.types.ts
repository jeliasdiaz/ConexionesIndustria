
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
            "admins": {
                  Row: {
                    "created_at": string,"email": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor": string,"at": string,"event_id": string | null,"id": number,"meta": NonNullable<Json>,"submission_id": string | null
                  }
                  Insert: {
                    "action": string,"actor": string,"at"?: string,"event_id"?: string | null,"id"?: number,"meta"?: NonNullable<Json>,"submission_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor"?: string,"at"?: string,"event_id"?: string | null,"id"?: number,"meta"?: NonNullable<Json>,"submission_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"email_otps": {
                  Row: {
                    "attempts": number,"client_ip": unknown,"code_hash": string,"consumed_at": string | null,"created_at": string,"email": string,"event_id": string,"expires_at": string,"id": string
                  }
                  Insert: {
                    "attempts"?: number,"client_ip"?: unknown,"code_hash": string,"consumed_at"?: string | null,"created_at"?: string,"email": string,"event_id": string,"expires_at": string,"id"?: string
                  }
                  Update: {
                    "attempts"?: number,"client_ip"?: unknown,"code_hash"?: string,"consumed_at"?: string | null,"created_at"?: string,"email"?: string,"event_id"?: string,"expires_at"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "email_otps_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"event_templates": {
                  Row: {
                    "event_id": string,"template_id": string
                  }
                  Insert: {
                    "event_id": string,"template_id": string
                  }
                  Update: {
                    "event_id"?: string,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "event_templates_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "event_templates_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    }
                  ]
                },"events": {
                  Row: {
                    "allowed_email_domains": (string)[],"approved_by": string,"created_at": string,"created_by": string,"deadline": string,"default_program": string | null,"description": string,"enforce_roster": boolean,"event_date": string,"extra_allowed_emails": (string)[],"id": string,"minors_digital_enabled": boolean,"name": string,"opens_at": string | null,"place": string,"purge_approved_at": string | null,"purged_at": string | null,"require_email": boolean,"responsible_teacher": string,"retention_until": string,"signature_mode": string,"slug": string,"status": string,"transport": string
                  }
                  Insert: {
                    "allowed_email_domains"?: (string)[],"approved_by": string,"created_at"?: string,"created_by": string,"deadline": string,"default_program"?: string | null,"description": string,"enforce_roster"?: boolean,"event_date": string,"extra_allowed_emails"?: (string)[],"id"?: string,"minors_digital_enabled"?: boolean,"name": string,"opens_at"?: string | null,"place": string,"purge_approved_at"?: string | null,"purged_at"?: string | null,"require_email"?: boolean,"responsible_teacher": string,"retention_until": string,"signature_mode"?: string,"slug": string,"status"?: string,"transport": string
                  }
                  Update: {
                    "allowed_email_domains"?: (string)[],"approved_by"?: string,"created_at"?: string,"created_by"?: string,"deadline"?: string,"default_program"?: string | null,"description"?: string,"enforce_roster"?: boolean,"event_date"?: string,"extra_allowed_emails"?: (string)[],"id"?: string,"minors_digital_enabled"?: boolean,"name"?: string,"opens_at"?: string | null,"place"?: string,"purge_approved_at"?: string | null,"purged_at"?: string | null,"require_email"?: boolean,"responsible_teacher"?: string,"retention_until"?: string,"signature_mode"?: string,"slug"?: string,"status"?: string,"transport"?: string
                  }
                  Relationships: [
                    
                  ]
                },"generated_documents": {
                  Row: {
                    "created_at": string,"event_id": string,"id": string,"purpose": string,"sha256": string,"storage_path": string,"submission_id": string | null,"template_id": string
                  }
                  Insert: {
                    "created_at"?: string,"event_id": string,"id"?: string,"purpose": string,"sha256": string,"storage_path": string,"submission_id"?: string | null,"template_id": string
                  }
                  Update: {
                    "created_at"?: string,"event_id"?: string,"id"?: string,"purpose"?: string,"sha256"?: string,"storage_path"?: string,"submission_id"?: string | null,"template_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "generated_documents_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generated_documents_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generated_documents_template_id_fkey"
      columns: ["template_id"]
isOneToOne: false
      referencedRelation: "templates"
      referencedColumns: ["id"]
    }
                  ]
                },"roster": {
                  Row: {
                    "email": string | null,"event_id": string,"full_name": string,"program": string | null,"student_code": string
                  }
                  Insert: {
                    "email"?: string | null,"event_id": string,"full_name": string,"program"?: string | null,"student_code": string
                  }
                  Update: {
                    "email"?: string | null,"event_id"?: string,"full_name"?: string,"program"?: string | null,"student_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "acceptance": NonNullable<Json>,"allergies": string,"attempts": number,"client_ip": unknown,"created_at": string,"document_conflict": boolean,"email": string | null,"emergency_name": string,"emergency_phone": string,"emergency_relationship": string,"eps_name": string,"event_id": string,"full_name": string,"id": string,"id_number": string,"id_type": string,"idempotency_key": string,"is_minor": boolean,"last_error": string | null,"locked_at": string | null,"medical_condition": string,"owner_key": string,"program": string,"roster_mismatch": boolean,"signature_path": string | null,"status": string,"student_code": string,"superseded_at": string | null,"supersedes_id": string | null,"user_agent": string | null
                  }
                  Insert: {
                    "acceptance": NonNullable<Json>,"allergies": string,"attempts"?: number,"client_ip"?: unknown,"created_at"?: string,"document_conflict"?: boolean,"email"?: string | null,"emergency_name": string,"emergency_phone": string,"emergency_relationship": string,"eps_name": string,"event_id": string,"full_name": string,"id"?: string,"id_number": string,"id_type": string,"idempotency_key": string,"is_minor"?: boolean,"last_error"?: string | null,"locked_at"?: string | null,"medical_condition": string,"owner_key": string,"program": string,"roster_mismatch"?: boolean,"signature_path"?: string | null,"status"?: string,"student_code": string,"superseded_at"?: string | null,"supersedes_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "acceptance"?: NonNullable<Json>,"allergies"?: string,"attempts"?: number,"client_ip"?: unknown,"created_at"?: string,"document_conflict"?: boolean,"email"?: string | null,"emergency_name"?: string,"emergency_phone"?: string,"emergency_relationship"?: string,"eps_name"?: string,"event_id"?: string,"full_name"?: string,"id"?: string,"id_number"?: string,"id_type"?: string,"idempotency_key"?: string,"is_minor"?: boolean,"last_error"?: string | null,"locked_at"?: string | null,"medical_condition"?: string,"owner_key"?: string,"program"?: string,"roster_mismatch"?: boolean,"signature_path"?: string | null,"status"?: string,"student_code"?: string,"superseded_at"?: string | null,"supersedes_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_event_id_fkey"
      columns: ["event_id"]
isOneToOne: false
      referencedRelation: "events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "submissions_supersedes_id_fkey"
      columns: ["supersedes_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"templates": {
                  Row: {
                    "audience": string,"created_at": string,"created_by": string,"id": string,"kind": string,"legal_html_raw": string | null,"name": string,"sha256": string,"storage_path": string,"tags": (string)[],"version": number
                  }
                  Insert: {
                    "audience"?: string,"created_at"?: string,"created_by": string,"id"?: string,"kind": string,"legal_html_raw"?: string | null,"name": string,"sha256": string,"storage_path": string,"tags": (string)[],"version": number
                  }
                  Update: {
                    "audience"?: string,"created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"legal_html_raw"?: string | null,"name"?: string,"sha256"?: string,"storage_path"?: string,"tags"?: (string)[],"version"?: number
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_submission":
{ Args: { "p_id": string }; Returns: boolean
                           },
"submit_submission":
{ Args: { "p": Json }; Returns: {
              "replayed": boolean,"submission_id": string
            }[]
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

