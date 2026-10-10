export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      portal_onboarding: {
        Row: {
          completed_at: string
          role: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          role: string
          user_id: string
        }
        Update: {
          completed_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      school_email_deliveries: {
        Row: {
          attempted_at: string | null
          attempts: number
          created_at: string
          email: string
          entity_id: string
          family_id: string | null
          id: string
          kind: string
          last_error: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempted_at?: string | null
          attempts?: number
          created_at?: string
          email: string
          entity_id: string
          family_id?: string | null
          id?: string
          kind: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempted_at?: string | null
          attempts?: number
          created_at?: string
          email?: string
          entity_id?: string
          family_id?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_email_deliveries_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_impersonations: {
        Row: {
          developer_email: string
          developer_id: string
          developer_session_id: string
          ended_at: string | null
          expires_at: string
          id: string
          started_at: string
          target_email: string
          target_id: string
          target_session_id: string
        }
        Insert: {
          developer_email: string
          developer_id: string
          developer_session_id: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          started_at?: string
          target_email: string
          target_id: string
          target_session_id: string
        }
        Update: {
          developer_email?: string
          developer_id?: string
          developer_session_id?: string
          ended_at?: string | null
          expires_at?: string
          id?: string
          started_at?: string
          target_email?: string
          target_id?: string
          target_session_id?: string
        }
        Relationships: []
      }
      learning_goals: {
        Row: {
          ayah_from: number | null
          ayah_to: number | null
          created_at: string
          created_by: string | null
          feedback: string | null
          id: string
          latest_update_id: string | null
          next_target: string | null
          status: string
          student_id: string
          subject: string
          surah: string | null
          title: string
          updated_at: string
          updated_by_name: string
        }
        Insert: {
          ayah_from?: number | null
          ayah_to?: number | null
          created_at?: string
          created_by?: string | null
          feedback?: string | null
          id?: string
          latest_update_id?: string | null
          next_target?: string | null
          status: string
          student_id: string
          subject: string
          surah?: string | null
          title: string
          updated_at?: string
          updated_by_name: string
        }
        Update: {
          ayah_from?: number | null
          ayah_to?: number | null
          created_at?: string
          created_by?: string | null
          feedback?: string | null
          id?: string
          latest_update_id?: string | null
          next_target?: string | null
          status?: string
          student_id?: string
          subject?: string
          surah?: string | null
          title?: string
          updated_at?: string
          updated_by_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_goals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_progress_updates: {
        Row: {
          created_at: string
          feedback: string | null
          goal_id: string
          id: string
          next_target: string | null
          recorded_by: string | null
          status: string
          student_id: string
          teacher_name: string
        }
        Insert: {
          created_at?: string
          feedback?: string | null
          goal_id: string
          id?: string
          next_target?: string | null
          recorded_by?: string | null
          status: string
          student_id: string
          teacher_name: string
        }
        Update: {
          created_at?: string
          feedback?: string | null
          goal_id?: string
          id?: string
          next_target?: string | null
          recorded_by?: string | null
          status?: string
          student_id?: string
          teacher_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_updates_goal_id_student_id_fkey"
            columns: ["goal_id", "student_id"]
            isOneToOne: false
            referencedRelation: "learning_goals"
            referencedColumns: ["id", "student_id"]
          },
        ]
      }
      announcement_deliveries: {
        Row: {
          announcement_id: string
          attempted_at: string | null
          attempts: number
          batch_id: string | null
          email: string
          error: string | null
          family_ids: string[]
          id: string
          language: string
          sent_at: string | null
          status: string
        }
        Insert: {
          announcement_id: string
          attempted_at?: string | null
          attempts?: number
          batch_id?: string | null
          email: string
          error?: string | null
          family_ids: string[]
          id?: string
          language: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          announcement_id?: string
          attempted_at?: string | null
          attempts?: number
          batch_id?: string | null
          email?: string
          error?: string | null
          family_ids?: string[]
          id?: string
          language?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_deliveries_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "school_announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_families: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          announcement_id: string
          family_id: string
          family_name: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          announcement_id: string
          family_id: string
          family_name: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          announcement_id?: string
          family_id?: string
          family_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_families_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "school_announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_families_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      school_announcements: {
        Row: {
          body: string
          class_id: string | null
          class_name_en: string | null
          class_name_no: string | null
          created_by: string | null
          email_enabled: boolean
          id: string
          published_at: string
          requires_acknowledgement: boolean
          school_year_id: string
          title: string
        }
        Insert: {
          body: string
          class_id?: string | null
          class_name_en?: string | null
          class_name_no?: string | null
          created_by?: string | null
          email_enabled?: boolean
          id: string
          published_at?: string
          requires_acknowledgement?: boolean
          school_year_id: string
          title: string
        }
        Update: {
          body?: string
          class_id?: string | null
          class_name_en?: string | null
          class_name_no?: string | null
          created_by?: string | null
          email_enabled?: boolean
          id?: string
          published_at?: string
          requires_acknowledgement?: boolean
          school_year_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_announcements_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_announcements_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      absence_reports: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reported_by: string | null
          reported_by_guardian_id: string | null
          school_day_id: string
          source: string
          student_id: string
          withdrawn_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reported_by?: string | null
          reported_by_guardian_id?: string | null
          school_day_id: string
          source?: string
          student_id: string
          withdrawn_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reported_by?: string | null
          reported_by_guardian_id?: string | null
          school_day_id?: string
          source?: string
          student_id?: string
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "absence_reports_reported_by_guardian_id_fkey"
            columns: ["reported_by_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_reports_reported_by_guardian_id_fkey"
            columns: ["reported_by_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
          {
            foreignKeyName: "absence_reports_school_day_id_fkey"
            columns: ["school_day_id"]
            isOneToOne: false
            referencedRelation: "school_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absence_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          id: string
          inherited_from_lesson_id: string | null
          lesson_id: string | null
          marked_at: string
          marked_by: string | null
          school_day_id: string
          status: string
          student_id: string
        }
        Insert: {
          id?: string
          inherited_from_lesson_id?: string | null
          lesson_id?: string | null
          marked_at?: string
          marked_by?: string | null
          school_day_id: string
          status: string
          student_id: string
        }
        Update: {
          id?: string
          inherited_from_lesson_id?: string | null
          lesson_id?: string | null
          marked_at?: string
          marked_by?: string | null
          school_day_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_inherited_from_lesson_id_fkey"
            columns: ["inherited_from_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_day_id_fkey"
            columns: ["school_day_id"]
            isOneToOne: false
            referencedRelation: "school_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      class_notes: {
        Row: {
          author_guardian_id: string | null
          class_id: string
          created_at: string
          homework: string | null
          id: string
          lesson_id: string
          school_day_id: string
          summary: string | null
          updated_at: string
        }
        Insert: {
          author_guardian_id?: string | null
          class_id: string
          created_at?: string
          homework?: string | null
          id?: string
          lesson_id: string
          school_day_id: string
          summary?: string | null
          updated_at?: string
        }
        Update: {
          author_guardian_id?: string | null
          class_id?: string
          created_at?: string
          homework?: string | null
          id?: string
          lesson_id?: string
          school_day_id?: string
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_notes_author_guardian_id_fkey"
            columns: ["author_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_notes_author_guardian_id_fkey"
            columns: ["author_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
          {
            foreignKeyName: "class_notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_notes_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_notes_school_day_id_fkey"
            columns: ["school_day_id"]
            isOneToOne: false
            referencedRelation: "school_days"
            referencedColumns: ["id"]
          },
        ]
      }
      class_slot_plans: {
        Row: {
          class_id: string
          co_teacher_guardian_id: string | null
          created_at: string
          end_position: number
          id: string
          school_year_id: string
          start_position: number
          subject: string | null
          teacher_guardian_id: string | null
          updated_at: string
        }
        Insert: {
          class_id: string
          co_teacher_guardian_id?: string | null
          created_at?: string
          end_position: number
          id?: string
          school_year_id: string
          start_position: number
          subject?: string | null
          teacher_guardian_id?: string | null
          updated_at?: string
        }
        Update: {
          class_id?: string
          co_teacher_guardian_id?: string | null
          created_at?: string
          end_position?: number
          id?: string
          school_year_id?: string
          start_position?: number
          subject?: string | null
          teacher_guardian_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_slot_plans_co_teacher_guardian_id_fkey"
            columns: ["co_teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_slot_plans_co_teacher_guardian_id_fkey"
            columns: ["co_teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
          {
            foreignKeyName: "class_slot_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_slot_plans_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_slot_plans_teacher_guardian_id_fkey"
            columns: ["teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_slot_plans_teacher_guardian_id_fkey"
            columns: ["teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
        ]
      }
      class_substitutes: {
        Row: {
          class_id: string
          created_at: string
          guardian_id: string
          school_year_id: string
          until: string
        }
        Insert: {
          class_id: string
          created_at?: string
          guardian_id: string
          school_year_id: string
          until: string
        }
        Update: {
          class_id?: string
          created_at?: string
          guardian_id?: string
          school_year_id?: string
          until?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_substitutes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_substitutes_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_substitutes_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
          {
            foreignKeyName: "class_substitutes_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      class_teachers: {
        Row: {
          class_id: string
          created_at: string
          guardian_id: string
          role: string
          school_year_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          guardian_id: string
          role?: string
          school_year_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          guardian_id?: string
          role?: string
          school_year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teachers_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teachers_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
          {
            foreignKeyName: "class_teachers_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      class_week_plans: {
        Row: {
          class_id: string
          created_at: string
          created_by: string | null
          description: string | null
          end_position: number | null
          id: string
          resource_url: string | null
          school_year_id: string
          sort_order: number
          start_position: number | null
          subject: string | null
          title: string
          updated_at: string
          week_start: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_position?: number | null
          id?: string
          resource_url?: string | null
          school_year_id: string
          sort_order?: number
          start_position?: number | null
          subject?: string | null
          title: string
          updated_at?: string
          week_start: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_position?: number | null
          id?: string
          resource_url?: string | null
          school_year_id?: string
          sort_order?: number
          start_position?: number | null
          subject?: string | null
          title?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_week_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_week_plans_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          age_max: number | null
          age_min: number | null
          capacity: number | null
          created_at: string
          curriculum_en: string | null
          curriculum_no: string | null
          description_en: string | null
          description_no: string | null
          id: string
          image_url: string | null
          name_en: string
          name_no: string
          price: number | null
          published: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          capacity?: number | null
          created_at?: string
          curriculum_en?: string | null
          curriculum_no?: string | null
          description_en?: string | null
          description_no?: string | null
          id?: string
          image_url?: string | null
          name_en: string
          name_no: string
          price?: number | null
          published?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          capacity?: number | null
          created_at?: string
          curriculum_en?: string | null
          curriculum_no?: string | null
          description_en?: string | null
          description_no?: string | null
          id?: string
          image_url?: string | null
          name_en?: string
          name_no?: string
          price?: number | null
          published?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          class_id: string
          created_at: string
          id: string
          price_snapshot: number | null
          school_year_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          price_snapshot?: number | null
          school_year_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          price_snapshot?: number | null
          school_year_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          body_en: string | null
          body_no: string | null
          created_at: string
          ends_at: string | null
          excerpt_en: string | null
          excerpt_no: string | null
          id: string
          image_url: string | null
          location: string | null
          published: boolean
          slug: string
          starts_at: string | null
          title_en: string
          title_no: string
          updated_at: string
        }
        Insert: {
          body_en?: string | null
          body_no?: string | null
          created_at?: string
          ends_at?: string | null
          excerpt_en?: string | null
          excerpt_no?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          published?: boolean
          slug: string
          starts_at?: string | null
          title_en: string
          title_no: string
          updated_at?: string
        }
        Update: {
          body_en?: string | null
          body_no?: string | null
          created_at?: string
          ends_at?: string | null
          excerpt_en?: string | null
          excerpt_no?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          published?: boolean
          slug?: string
          starts_at?: string | null
          title_en?: string
          title_no?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_transactions: {
        Row: {
          account: string
          amount: number
          booked_at: string | null
          booked_on: string
          counterparty_name: string | null
          counterparty_phone: string | null
          currency: string
          entry_type: string | null
          external_id: string
          family_id: string | null
          id: string
          import_batch_id: string | null
          imported_at: string
          mapped_at: string | null
          mapped_by: string | null
          matched_payment_id: string | null
          message: string | null
          note: string | null
          psp_reference: string | null
          raw: Json
          reference: string | null
          sadaqa_gift_id: string | null
          source: string
          status: string
          suggested_status: string | null
          suggestion_reason: string | null
        }
        Insert: {
          account: string
          amount: number
          booked_at?: string | null
          booked_on: string
          counterparty_name?: string | null
          counterparty_phone?: string | null
          currency?: string
          entry_type?: string | null
          external_id: string
          family_id?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          mapped_at?: string | null
          mapped_by?: string | null
          matched_payment_id?: string | null
          message?: string | null
          note?: string | null
          psp_reference?: string | null
          raw?: Json
          reference?: string | null
          sadaqa_gift_id?: string | null
          source: string
          status?: string
          suggested_status?: string | null
          suggestion_reason?: string | null
        }
        Update: {
          account?: string
          amount?: number
          booked_at?: string | null
          booked_on?: string
          counterparty_name?: string | null
          counterparty_phone?: string | null
          currency?: string
          entry_type?: string | null
          external_id?: string
          family_id?: string | null
          id?: string
          import_batch_id?: string | null
          imported_at?: string
          mapped_at?: string | null
          mapped_by?: string | null
          matched_payment_id?: string | null
          message?: string | null
          note?: string | null
          psp_reference?: string | null
          raw?: Json
          reference?: string | null
          sadaqa_gift_id?: string | null
          source?: string
          status?: string
          suggested_status?: string | null
          suggestion_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_transactions_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "external_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "external_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_transactions_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "external_transactions_sadaqa_gift_id_fkey"
            columns: ["sadaqa_gift_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          display_name: string | null
          id: string
          origin: string
          postal_code: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          origin?: string
          postal_code?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          origin?: string
          postal_code?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_data_reviews: {
        Row: {
          category: string
          created_at: string
          details: Json
          family_id: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          source_entity: string | null
          source_entity_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json
          family_id: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_entity?: string | null
          source_entity_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json
          family_id?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_entity?: string | null
          source_entity_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_data_reviews_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_data_reviews_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      family_guardians: {
        Row: {
          created_at: string
          family_id: string
          guardian_id: string
          is_billing_contact: boolean
          is_primary_contact: boolean
          receives_communication: boolean
          relationship_label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          family_id: string
          guardian_id: string
          is_billing_contact?: boolean
          is_primary_contact?: boolean
          receives_communication?: boolean
          relationship_label?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          family_id?: string
          guardian_id?: string
          is_billing_contact?: boolean
          is_primary_contact?: boolean
          receives_communication?: boolean
          relationship_label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_guardians_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
        ]
      }
      family_pickup_persons: {
        Row: {
          created_at: string
          family_id: string
          id: string
          name: string
          phone: string | null
          relation: string | null
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          name: string
          phone?: string | null
          relation?: string | null
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          name?: string
          phone?: string | null
          relation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_pickup_persons_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      guardian_email_changes: {
        Row: {
          confirmed_at: string | null
          created_at: string
          expires_at: string
          guardian_id: string
          id: string
          new_email: string
          requested_by: string | null
          token_hash: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          expires_at: string
          guardian_id: string
          id?: string
          new_email: string
          requested_by?: string | null
          token_hash: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          guardian_id?: string
          id?: string
          new_email?: string
          requested_by?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_email_changes_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardian_email_changes_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          is_teacher: boolean
          is_volunteer: boolean
          last_name: string | null
          phone: string | null
          source_application_id: string | null
          teacher_note: string | null
          teacher_suspended_at: string | null
          teacher_suspended_by: string | null
          teacher_suspended_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_teacher?: boolean
          is_volunteer?: boolean
          last_name?: string | null
          phone?: string | null
          source_application_id?: string | null
          teacher_note?: string | null
          teacher_suspended_at?: string | null
          teacher_suspended_by?: string | null
          teacher_suspended_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_teacher?: boolean
          is_volunteer?: boolean
          last_name?: string | null
          phone?: string | null
          source_application_id?: string | null
          teacher_note?: string | null
          teacher_suspended_at?: string | null
          teacher_suspended_by?: string | null
          teacher_suspended_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_source_application_id_fkey"
            columns: ["source_application_id"]
            isOneToOne: false
            referencedRelation: "teacher_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          account: string | null
          created_at: string
          created_by: string | null
          duplicate_count: number
          errors: Json
          file_name: string | null
          id: string
          inserted_count: number
          kind: string
          matched_count: number
          period_from: string | null
          period_to: string | null
          row_count: number
          skipped_count: number
          source: string
        }
        Insert: {
          account?: string | null
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          errors?: Json
          file_name?: string | null
          id?: string
          inserted_count?: number
          kind: string
          matched_count?: number
          period_from?: string | null
          period_to?: string | null
          row_count?: number
          skipped_count?: number
          source: string
        }
        Update: {
          account?: string | null
          created_at?: string
          created_by?: string | null
          duplicate_count?: number
          errors?: Json
          file_name?: string | null
          id?: string
          inserted_count?: number
          kind?: string
          matched_count?: number
          period_from?: string | null
          period_to?: string | null
          row_count?: number
          skipped_count?: number
          source?: string
        }
        Relationships: []
      }
      info_blocks: {
        Row: {
          body_en: string | null
          body_no: string | null
          id: string
          image_url: string | null
          key: string
          sort_order: number
          title_en: string | null
          title_no: string | null
          updated_at: string
        }
        Insert: {
          body_en?: string | null
          body_no?: string | null
          id?: string
          image_url?: string | null
          key: string
          sort_order?: number
          title_en?: string | null
          title_no?: string | null
          updated_at?: string
        }
        Update: {
          body_en?: string | null
          body_no?: string | null
          id?: string
          image_url?: string | null
          key?: string
          sort_order?: number
          title_en?: string | null
          title_no?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          note: string | null
          payment_id: string | null
          plan_id: string
          reminder_sent_at: string | null
          school_year_id: string
          sent_at: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          note?: string | null
          payment_id?: string | null
          plan_id: string
          reminder_sent_at?: string | null
          school_year_id: string
          sent_at?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          note?: string | null
          payment_id?: string | null
          plan_id?: string
          reminder_sent_at?: string | null
          school_year_id?: string
          sent_at?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          cancelled: boolean
          class_id: string
          co_teacher_guardian_id: string | null
          created_at: string
          end_position: number
          id: string
          is_override: boolean
          is_substitute: boolean
          note: string | null
          plan_id: string | null
          school_day_id: string
          start_position: number
          subject: string | null
          teacher_guardian_id: string | null
          updated_at: string
        }
        Insert: {
          cancelled?: boolean
          class_id: string
          co_teacher_guardian_id?: string | null
          created_at?: string
          end_position: number
          id?: string
          is_override?: boolean
          is_substitute?: boolean
          note?: string | null
          plan_id?: string | null
          school_day_id: string
          start_position: number
          subject?: string | null
          teacher_guardian_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelled?: boolean
          class_id?: string
          co_teacher_guardian_id?: string | null
          created_at?: string
          end_position?: number
          id?: string
          is_override?: boolean
          is_substitute?: boolean
          note?: string | null
          plan_id?: string | null
          school_day_id?: string
          start_position?: number
          subject?: string | null
          teacher_guardian_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_co_teacher_guardian_id_fkey"
            columns: ["co_teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_co_teacher_guardian_id_fkey"
            columns: ["co_teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
          {
            foreignKeyName: "lessons_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "class_slot_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_school_day_id_fkey"
            columns: ["school_day_id"]
            isOneToOne: false
            referencedRelation: "school_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_teacher_guardian_id_fkey"
            columns: ["teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_teacher_guardian_id_fkey"
            columns: ["teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
        ]
      }
      payment_allocation_locks: {
        Row: {
          locked_at: string
          locked_by: string | null
          payment_id: string
        }
        Insert: {
          locked_at?: string
          locked_by?: string | null
          payment_id: string
        }
        Update: {
          locked_at?: string
          locked_by?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocation_locks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "payment_allocation_locks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_allocation_locks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocation_locks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string
          school_year_id: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id: string
          school_year_id: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string
          school_year_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_allocations_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          id: string
          idempotency_key: string | null
          name: string
          occurred_at: string
          payment_id: string | null
          psp_reference: string | null
          reference: string
          success: boolean | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          name: string
          occurred_at: string
          payment_id?: string | null
          psp_reference?: string | null
          reference: string
          success?: boolean | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          name?: string
          occurred_at?: string
          payment_id?: string | null
          psp_reference?: string | null
          reference?: string
          success?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          created_at: string
          created_by: string
          custom_config: Json | null
          family_id: string
          id: string
          monthly_amount: number | null
          note: string | null
          paused_at: string | null
          plan_type: string
          school_year_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          custom_config?: Json | null
          family_id: string
          id?: string
          monthly_amount?: number | null
          note?: string | null
          paused_at?: string | null
          plan_type: string
          school_year_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          custom_config?: Json | null
          family_id?: string
          id?: string
          monthly_amount?: number | null
          note?: string | null
          paused_at?: string | null
          plan_type?: string
          school_year_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reconciliation_issues: {
        Row: {
          flagged_at: string
          kind: string
          local_amount: number
          payment_id: string
          provider_amount: number
          resolved_at: string | null
        }
        Insert: {
          flagged_at?: string
          kind: string
          local_amount: number
          payment_id: string
          provider_amount: number
          resolved_at?: string | null
        }
        Update: {
          flagged_at?: string
          kind?: string
          local_amount?: number
          payment_id?: string
          provider_amount?: number
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliation_issues_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "payment_reconciliation_issues_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_reconciliation_issues_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reconciliation_issues_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      payment_targets: {
        Row: {
          amount: number
          created_at: string
          payment_id: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          payment_id: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          payment_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_targets_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "payment_targets_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_targets_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_targets_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payment_targets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          authorized_amount: number
          captured_amount: number
          captured_at: string | null
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          duplicate_of_payment_id: string | null
          duplicate_reviewed_at: string | null
          duplicate_reviewed_by: string | null
          enrollment_id: string | null
          id: string
          last_synced_at: string | null
          method: string
          net_paid_amount: number | null
          paid_at: string | null
          payer_email: string | null
          payer_name: string | null
          payer_phone: string | null
          psp_reference: string | null
          redirect_url: string | null
          reference: string
          refunded_amount: number
          school_year_id: string | null
          status: string
          student_id: string | null
          updated_at: string
          vipps_payment_method: string | null
          vipps_state: string | null
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          authorized_amount?: number
          captured_amount?: number
          captured_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          duplicate_of_payment_id?: string | null
          duplicate_reviewed_at?: string | null
          duplicate_reviewed_by?: string | null
          enrollment_id?: string | null
          id?: string
          last_synced_at?: string | null
          method?: string
          net_paid_amount?: number | null
          paid_at?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          psp_reference?: string | null
          redirect_url?: string | null
          reference: string
          refunded_amount?: number
          school_year_id?: string | null
          status?: string
          student_id?: string | null
          updated_at?: string
          vipps_payment_method?: string | null
          vipps_state?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          authorized_amount?: number
          captured_amount?: number
          captured_at?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          duplicate_of_payment_id?: string | null
          duplicate_reviewed_at?: string | null
          duplicate_reviewed_by?: string | null
          enrollment_id?: string | null
          id?: string
          last_synced_at?: string | null
          method?: string
          net_paid_amount?: number | null
          paid_at?: string | null
          payer_email?: string | null
          payer_name?: string | null
          payer_phone?: string | null
          psp_reference?: string | null
          redirect_url?: string | null
          reference?: string
          refunded_amount?: number
          school_year_id?: string | null
          status?: string
          student_id?: string | null
          updated_at?: string
          vipps_payment_method?: string | null
          vipps_state?: string | null
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_duplicate_of_payment_id_fkey"
            columns: ["duplicate_of_payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "payments_duplicate_of_payment_id_fkey"
            columns: ["duplicate_of_payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payments_duplicate_of_payment_id_fkey"
            columns: ["duplicate_of_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_duplicate_of_payment_id_fkey"
            columns: ["duplicate_of_payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "payments_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_login_throttle: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          method: string
          payment_id: string
          psp_reference: string | null
          reason: string
          refund_group_id: string
          refunded_by: string
          refunded_on: string
          school_year_id: string | null
          student_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          method: string
          payment_id: string
          psp_reference?: string | null
          reason: string
          refund_group_id?: string
          refunded_by: string
          refunded_on?: string
          school_year_id?: string | null
          student_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          method?: string
          payment_id?: string
          psp_reference?: string | null
          reason?: string
          refund_group_id?: string
          refunded_by?: string
          refunded_on?: string
          school_year_id?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "refunds_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      sadaqa_gifts: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          donor_name: string | null
          family_id: string | null
          id: string
          method: string
          note: string | null
          received_on: string
          school_year_id: string | null
          source_payment_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          donor_name?: string | null
          family_id?: string | null
          id?: string
          method: string
          note?: string | null
          received_on?: string
          school_year_id?: string | null
          source_payment_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          donor_name?: string | null
          family_id?: string | null
          id?: string
          method?: string
          note?: string | null
          received_on?: string
          school_year_id?: string | null
          source_payment_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sadaqa_gifts_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sadaqa_gifts_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sadaqa_gifts_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "sadaqa_gifts_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "sadaqa_gifts_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sadaqa_gifts_source_payment_id_fkey"
            columns: ["source_payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      school_days: {
        Row: {
          cancelled: boolean
          created_at: string
          date: string
          id: string
          note: string | null
          school_year_id: string
        }
        Insert: {
          cancelled?: boolean
          created_at?: string
          date: string
          id?: string
          note?: string | null
          school_year_id: string
        }
        Update: {
          cancelled?: boolean
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          school_year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_days_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_time_slots: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          label: string
          position: number
          school_year_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          label: string
          position: number
          school_year_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          label?: string
          position?: number
          school_year_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_time_slots_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_years: {
        Row: {
          created_at: string
          ends_on: string | null
          enrollment_fee: number
          fee: number | null
          id: string
          is_active: boolean
          label: string
          monthly_due_day: number
          sem1_due_on: string | null
          sem2_due_on: string | null
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_on?: string | null
          enrollment_fee?: number
          fee?: number | null
          id?: string
          is_active?: boolean
          label: string
          monthly_due_day?: number
          sem1_due_on?: string | null
          sem2_due_on?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_on?: string | null
          enrollment_fee?: number
          fee?: number | null
          id?: string
          is_active?: boolean
          label?: string
          monthly_due_day?: number
          sem1_due_on?: string | null
          sem2_due_on?: string | null
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sibling_discount_dismissals: {
        Row: {
          created_at: string
          dismissed_by: string
          family_id: string
          school_year_id: string
        }
        Insert: {
          created_at?: string
          dismissed_by: string
          family_id: string
          school_year_id: string
        }
        Update: {
          created_at?: string
          dismissed_by?: string
          family_id?: string
          school_year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sibling_discount_dismissals_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sibling_discount_dismissals_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          address: string | null
          contact_email: string | null
          enroll_email: string | null
          facebook_url: string | null
          hours: string | null
          id: boolean
          instagram_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          enroll_email?: string | null
          facebook_url?: string | null
          hours?: string | null
          id?: boolean
          instagram_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          enroll_email?: string | null
          facebook_url?: string | null
          hours?: string | null
          id?: boolean
          instagram_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_applications: {
        Row: {
          child_address: string | null
          child_birth_date: string | null
          child_city: string | null
          child_email: string | null
          child_first_name: string | null
          child_gender: string | null
          child_last_name: string | null
          child_level_arabic: string | null
          child_level_islam: string | null
          child_level_quran: string | null
          child_phone: string | null
          child_postal_code: string | null
          created_at: string
          desired_class: string | null
          family_id: string | null
          father_email: string | null
          father_first_name: string | null
          father_last_name: string | null
          father_phone: string | null
          id: string
          merged_into_student_id: string | null
          message: string | null
          mother_email: string | null
          mother_first_name: string | null
          mother_last_name: string | null
          mother_phone: string | null
          payment_id: string | null
          status: string
          terms_accepted: boolean
        }
        Insert: {
          child_address?: string | null
          child_birth_date?: string | null
          child_city?: string | null
          child_email?: string | null
          child_first_name?: string | null
          child_gender?: string | null
          child_last_name?: string | null
          child_level_arabic?: string | null
          child_level_islam?: string | null
          child_level_quran?: string | null
          child_phone?: string | null
          child_postal_code?: string | null
          created_at?: string
          desired_class?: string | null
          family_id?: string | null
          father_email?: string | null
          father_first_name?: string | null
          father_last_name?: string | null
          father_phone?: string | null
          id?: string
          merged_into_student_id?: string | null
          message?: string | null
          mother_email?: string | null
          mother_first_name?: string | null
          mother_last_name?: string | null
          mother_phone?: string | null
          payment_id?: string | null
          status?: string
          terms_accepted?: boolean
        }
        Update: {
          child_address?: string | null
          child_birth_date?: string | null
          child_city?: string | null
          child_email?: string | null
          child_first_name?: string | null
          child_gender?: string | null
          child_last_name?: string | null
          child_level_arabic?: string | null
          child_level_islam?: string | null
          child_level_quran?: string | null
          child_phone?: string | null
          child_postal_code?: string | null
          created_at?: string
          desired_class?: string | null
          family_id?: string | null
          father_email?: string | null
          father_first_name?: string | null
          father_last_name?: string | null
          father_phone?: string | null
          id?: string
          merged_into_student_id?: string | null
          message?: string | null
          mother_email?: string | null
          mother_first_name?: string | null
          mother_last_name?: string | null
          mother_phone?: string | null
          payment_id?: string | null
          status?: string
          terms_accepted?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "student_applications_merged_into_student_id_fkey"
            columns: ["merged_into_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["matched_payment_id"]
          },
          {
            foreignKeyName: "student_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "duplicate_payment_candidates"
            referencedColumns: ["payment_id"]
          },
          {
            foreignKeyName: "student_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "sadaqa_disbursements"
            referencedColumns: ["payment_id"]
          },
        ]
      }
      student_fee_adjustments: {
        Row: {
          amount: number
          created_at: string
          granted_by: string
          id: string
          legacy_fee_id: string | null
          note: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          school_year_id: string
          student_id: string
          teacher_guardian_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          granted_by: string
          id?: string
          legacy_fee_id?: string | null
          note: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          school_year_id: string
          student_id: string
          teacher_guardian_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          granted_by?: string
          id?: string
          legacy_fee_id?: string | null
          note?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          school_year_id?: string
          student_id?: string
          teacher_guardian_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_adjustments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fee_adjustments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fee_adjustments_teacher_guardian_id_fkey"
            columns: ["teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fee_adjustments_teacher_guardian_id_fkey"
            columns: ["teacher_guardian_id"]
            isOneToOne: false
            referencedRelation: "teacher_gift_report"
            referencedColumns: ["teacher_guardian_id"]
          },
        ]
      }
      student_fees: {
        Row: {
          amount: number
          created_at: string
          discount: number
          id: string
          note: string | null
          school_year_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          discount?: number
          id?: string
          note?: string | null
          school_year_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          discount?: number
          id?: string
          note?: string | null
          school_year_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_pick_up: boolean
          created_at: string
          family_id: string
          guardian_id: string
          has_legal_guardianship: boolean
          is_primary: boolean
          receives_communication: boolean
          relationship_label: string
          sort_order: number
          student_id: string
          updated_at: string
        }
        Insert: {
          can_pick_up?: boolean
          created_at?: string
          family_id: string
          guardian_id: string
          has_legal_guardianship?: boolean
          is_primary?: boolean
          receives_communication?: boolean
          relationship_label?: string
          sort_order?: number
          student_id: string
          updated_at?: string
        }
        Update: {
          can_pick_up?: boolean
          created_at?: string
          family_id?: string
          guardian_id?: string
          has_legal_guardianship?: boolean
          is_primary?: boolean
          receives_communication?: boolean
          relationship_label?: string
          sort_order?: number
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_family_guardian_fkey"
            columns: ["family_id", "guardian_id"]
            isOneToOne: false
            referencedRelation: "family_guardians"
            referencedColumns: ["family_id", "guardian_id"]
          },
          {
            foreignKeyName: "student_guardians_student_family_fkey"
            columns: ["student_id", "family_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id", "family_id"]
          },
        ]
      }
      students: {
        Row: {
          allergies: string | null
          application_id: string | null
          child_address: string | null
          child_birth_date: string | null
          child_city: string | null
          child_email: string | null
          child_first_name: string | null
          child_gender: string | null
          child_last_name: string | null
          child_level_arabic: string | null
          child_level_islam: string | null
          child_level_quran: string | null
          child_phone: string | null
          child_postal_code: string | null
          continues_answered_at: string | null
          continues_next_year: boolean | null
          created_at: string
          family_id: string | null
          father_email: string | null
          father_first_name: string | null
          father_last_name: string | null
          father_phone: string | null
          health_updated_at: string | null
          id: string
          medical_notes: string | null
          mother_email: string | null
          mother_first_name: string | null
          mother_last_name: string | null
          mother_phone: string | null
          notes: string | null
          photo_consent: boolean | null
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          application_id?: string | null
          child_address?: string | null
          child_birth_date?: string | null
          child_city?: string | null
          child_email?: string | null
          child_first_name?: string | null
          child_gender?: string | null
          child_last_name?: string | null
          child_level_arabic?: string | null
          child_level_islam?: string | null
          child_level_quran?: string | null
          child_phone?: string | null
          child_postal_code?: string | null
          continues_answered_at?: string | null
          continues_next_year?: boolean | null
          created_at?: string
          family_id?: string | null
          father_email?: string | null
          father_first_name?: string | null
          father_last_name?: string | null
          father_phone?: string | null
          health_updated_at?: string | null
          id?: string
          medical_notes?: string | null
          mother_email?: string | null
          mother_first_name?: string | null
          mother_last_name?: string | null
          mother_phone?: string | null
          notes?: string | null
          photo_consent?: boolean | null
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          application_id?: string | null
          child_address?: string | null
          child_birth_date?: string | null
          child_city?: string | null
          child_email?: string | null
          child_first_name?: string | null
          child_gender?: string | null
          child_last_name?: string | null
          child_level_arabic?: string | null
          child_level_islam?: string | null
          child_level_quran?: string | null
          child_phone?: string | null
          child_postal_code?: string | null
          continues_answered_at?: string | null
          continues_next_year?: boolean | null
          created_at?: string
          family_id?: string | null
          father_email?: string | null
          father_first_name?: string | null
          father_last_name?: string | null
          father_phone?: string | null
          health_updated_at?: string | null
          id?: string
          medical_notes?: string | null
          mother_email?: string | null
          mother_first_name?: string | null
          mother_last_name?: string | null
          mother_phone?: string | null
          notes?: string | null
          photo_consent?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_absences: {
        Row: {
          created_at: string
          created_by: string | null
          guardian_id: string
          id: string
          notified: boolean
          reason: string | null
          school_day_id: string
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          guardian_id: string
          id?: string
          notified?: boolean
          reason?: string | null
          school_day_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          guardian_id?: string
          id?: string
          notified?: boolean
          reason?: string | null
          school_day_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_absences_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_absences_school_day_id_fkey"
            columns: ["school_day_id"]
            isOneToOne: false
            referencedRelation: "school_days"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_applications: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          phone: string | null
          status: string
          subjects: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message?: string | null
          phone?: string | null
          status?: string
          subjects?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string | null
          phone?: string | null
          status?: string
          subjects?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      duplicate_payment_candidates: {
        Row: {
          amount: number | null
          cited_reference: string | null
          description: string | null
          evidence: string | null
          matched_amount: number | null
          matched_created_at: string | null
          matched_payment_id: string | null
          matched_reference: string | null
          method: string | null
          paid_at: string | null
          payment_id: string | null
          school_year_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_adjustment_totals: {
        Row: {
          active_amount: number | null
          active_count: number | null
          revoked_amount: number | null
          revoked_count: number | null
          school_year_id: string | null
          type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_adjustments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      sadaqa_disbursements: {
        Row: {
          allocated_amount: number | null
          amount: number | null
          description: string | null
          disbursed_at: string | null
          net_paid_amount: number | null
          payment_id: string | null
          refunded_amount: number | null
          school_year_id: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
      student_balances: {
        Row: {
          owed: number | null
          paid: number | null
          remaining: number | null
          school_year_id: string | null
          state: string | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_gift_report: {
        Row: {
          first_name: string | null
          last_name: string | null
          school_year_id: string | null
          student_count: number | null
          teacher_guardian_id: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_fee_adjustments_school_year_id_fkey"
            columns: ["school_year_id"]
            isOneToOne: false
            referencedRelation: "school_years"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_school_emails: {
        Args: { p_family_id?: string; p_limit?: number }
        Returns: {
          attempted_at: string | null
          attempts: number
          created_at: string
          email: string
          entity_id: string
          family_id: string | null
          id: string
          kind: string
          last_error: string | null
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "school_email_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finish_school_email: {
        Args: {
          p_attempted_at: string
          p_error?: string
          p_id: string
          p_status: string
        }
        Returns: boolean
      }
      queue_overdue_payment_emails: { Args: never; Returns: undefined }
      search_word_matches: {
        Args: { p_term: string; p_word: string }
        Returns: boolean
      }
      search_matches: {
        Args: { p_query: string; p_text: string }
        Returns: boolean
      }
      normalize_search: { Args: { p_text: string }; Returns: string }
      admin_search_teacher_applications: {
        Args: { p_query?: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string | null
          phone: string | null
          status: string
          subjects: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "teacher_applications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_students: {
        Args: { p_query?: string }
        Returns: {
          allergies: string | null
          application_id: string | null
          child_address: string | null
          child_birth_date: string | null
          child_city: string | null
          child_email: string | null
          child_first_name: string | null
          child_gender: string | null
          child_last_name: string | null
          child_level_arabic: string | null
          child_level_islam: string | null
          child_level_quran: string | null
          child_phone: string | null
          child_postal_code: string | null
          continues_answered_at: string | null
          continues_next_year: boolean | null
          created_at: string
          family_id: string | null
          father_email: string | null
          father_first_name: string | null
          father_last_name: string | null
          father_phone: string | null
          health_updated_at: string | null
          id: string
          medical_notes: string | null
          mother_email: string | null
          mother_first_name: string | null
          mother_last_name: string | null
          mother_phone: string | null
          notes: string | null
          photo_consent: boolean | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "students"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_student_applications: {
        Args: { p_query?: string }
        Returns: {
          child_address: string | null
          child_birth_date: string | null
          child_city: string | null
          child_email: string | null
          child_first_name: string | null
          child_gender: string | null
          child_last_name: string | null
          child_level_arabic: string | null
          child_level_islam: string | null
          child_level_quran: string | null
          child_phone: string | null
          child_postal_code: string | null
          created_at: string
          desired_class: string | null
          family_id: string | null
          father_email: string | null
          father_first_name: string | null
          father_last_name: string | null
          father_phone: string | null
          id: string
          merged_into_student_id: string | null
          message: string | null
          mother_email: string | null
          mother_first_name: string | null
          mother_last_name: string | null
          mother_phone: string | null
          payment_id: string | null
          status: string
          terms_accepted: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "student_applications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_payments: {
        Args: { p_query?: string }
        Returns: {
          amount: number
          authorized_amount: number
          captured_amount: number
          captured_at: string | null
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          duplicate_of_payment_id: string | null
          duplicate_reviewed_at: string | null
          duplicate_reviewed_by: string | null
          enrollment_id: string | null
          id: string
          last_synced_at: string | null
          method: string
          net_paid_amount: number | null
          paid_at: string | null
          payer_email: string | null
          payer_name: string | null
          payer_phone: string | null
          psp_reference: string | null
          redirect_url: string | null
          reference: string
          refunded_amount: number
          school_year_id: string | null
          status: string
          student_id: string | null
          updated_at: string
          vipps_payment_method: string | null
          vipps_state: string | null
          void_reason: string | null
          voided_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_guardians: {
        Args: { p_query?: string }
        Returns: {
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          is_teacher: boolean
          is_volunteer: boolean
          last_name: string | null
          phone: string | null
          source_application_id: string | null
          teacher_note: string | null
          teacher_suspended_at: string | null
          teacher_suspended_by: string | null
          teacher_suspended_reason: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "guardians"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_families: {
        Args: { p_query?: string }
        Returns: {
          address: string | null
          city: string | null
          created_at: string
          display_name: string | null
          id: string
          origin: string
          postal_code: string | null
          preferred_language: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "families"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_classes: {
        Args: { p_query?: string }
        Returns: {
          age_max: number | null
          age_min: number | null
          capacity: number | null
          created_at: string
          curriculum_en: string | null
          curriculum_no: string | null
          description_en: string | null
          description_no: string | null
          id: string
          image_url: string | null
          name_en: string
          name_no: string
          price: number | null
          published: boolean
          slug: string
          sort_order: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "classes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_search_audit_log: {
        Args: { p_query?: string; p_actions?: string[] }
        Returns: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_log"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      developer_can_impersonate: { Args: Record<PropertyKey, never>; Returns: boolean }
      create_learning_goal: {
        Args: {
          p_ayah_from: number | null
          p_ayah_to: number | null
          p_class_id: string | null
          p_feedback: string | null
          p_id: string
          p_next_target: string | null
          p_status: string
          p_student_id: string
          p_subject: string
          p_surah: string | null
          p_title: string
        }
        Returns: string
      }
      record_learning_progress: {
        Args: {
          p_expected_update_id: string
          p_feedback: string | null
          p_goal_id: string
          p_id: string
          p_next_target: string | null
          p_status: string
        }
        Returns: string
      }
      learning_can_manage_student: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      learning_can_read_student: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      learning_class_students: {
        Args: { p_class_id: string }
        Returns: {
          first_name: string
          last_name: string
          student_id: string
        }[]
      }
      learning_teacher_name: { Args: never; Returns: string }
      acknowledge_announcement: {
        Args: { p_family_id: string; p_id: string }
        Returns: undefined
      }
      announcement_audience: {
        Args: { p_class_id?: string }
        Returns: {
          email_count: number
          family_count: number
          missing_email_count: number
        }[]
      }
      announcement_can_manage: { Args: { p_id: string }; Returns: boolean }
      announcement_can_publish: {
        Args: { p_class_id: string }
        Returns: boolean
      }
      announcement_family_status: {
        Args: { p_id: string }
        Returns: {
          acknowledged_at: string
          email_status: string
          family_id: string
          family_name: string
        }[]
      }
      announcement_target_emails: {
        Args: { p_class_id: string }
        Returns: {
          email: string
          family_ids: string[]
          language: string
        }[]
      }
      announcement_target_families: {
        Args: { p_class_id: string }
        Returns: {
          family_id: string
          family_name: string
        }[]
      }
      claim_announcement_emails: {
        Args: { p_id?: string; p_limit?: number }
        Returns: {
          announcement_id: string
          attempted_at: string | null
          attempts: number
          batch_id: string | null
          email: string
          error: string | null
          family_ids: string[]
          id: string
          language: string
          sent_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "announcement_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finish_announcement_email_batch: {
        Args: {
          p_attempted_at: string
          p_batch_id: string
          p_error?: string
          p_failed_ids: string[]
        }
        Returns: undefined
      }
      publish_announcement: {
        Args: {
          p_body: string
          p_class_id: string
          p_email_enabled?: boolean
          p_id: string
          p_requires_acknowledgement?: boolean
          p_title: string
        }
        Returns: string
      }
      retry_announcement_emails: { Args: { p_id: string }; Returns: undefined }
      admin_merge_children: {
        Args: {
          p_application?: string
          p_confirm?: boolean
          p_expected?: string
          p_keep: string
          p_student?: string
        }
        Returns: Json
      }
      admin_merge_families: {
        Args: { p_keep: string; p_merge: string }
        Returns: undefined
      }
      admin_merge_lessons: {
        Args: { p_lesson_id: string; p_other_lesson_id: string }
        Returns: undefined
      }
      admin_move_student_to_family: {
        Args: { p_family_id: string; p_student_id: string }
        Returns: undefined
      }
      admin_remove_guardian_from_family: {
        Args: { p_family_id: string; p_guardian_id: string }
        Returns: string
      }
      admin_reset_day_lessons: {
        Args: { p_class_id: string; p_school_day_id: string }
        Returns: number
      }
      admin_save_class_slot_plans: {
        Args: { p_class_id: string; p_plans: Json; p_school_year_id: string }
        Returns: number
      }
      admin_save_time_slots: {
        Args: { p_school_year_id: string; p_slots: Json }
        Returns: number
      }
      admin_split_lesson: { Args: { p_lesson_id: string }; Returns: number }
      admin_update_lesson: {
        Args: {
          p_cancelled: boolean
          p_co_teacher_guardian_id?: string | null
          p_lesson_id: string
          p_note: string | null
          p_subject: string | null
          p_teacher_guardian_id: string | null
        }
        Returns: undefined
      }
      auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      create_manual_family_student: {
        Args: { p_student: Json }
        Returns: string
      }
      create_portal_sibling_enrollment: {
        Args: {
          p_address: string
          p_amount: number
          p_child: Json
          p_city: string
          p_description: string
          p_family_id: string
          p_payer_guardian_id: string | null
          p_postal_code: string
          p_reference: string
          p_school_year_id: string
        }
        Returns: Json
      }
      create_public_family_enrollment: {
        Args: {
          p_address: string
          p_amount: number
          p_children: Json
          p_city: string
          p_description: string
          p_guardians: Json
          p_postal_code: string
          p_reference: string
          p_school_year_id: string
        }
        Returns: Json
      }
      ensure_lessons: { Args: { p_school_day_id: string }; Returns: number }
      ensure_school_days: {
        Args: { p_school_year_id: string }
        Returns: number
      }
      ensure_year_lessons: {
        Args: { p_school_year_id: string }
        Returns: number
      }
      is_admin: { Args: never; Returns: boolean }
      lesson_apply_absences: {
        Args: { p_lesson_id: string }
        Returns: undefined
      }
      lesson_plan_ranges: {
        Args: { p_class_id: string; p_school_year_id: string }
        Returns: {
          co_teacher_guardian_id: string
          end_position: number
          plan_id: string
          start_position: number
          subject: string
          teacher_guardian_id: string
        }[]
      }
      materialize_lessons: {
        Args: {
          p_class_id?: string
          p_force?: boolean
          p_school_day_id: string
        }
        Returns: number
      }
      portal_add_guardian: {
        Args: {
          p_family_id: string
          p_first_name: string
          p_last_name: string
          p_phone: string
          p_relationship_label: string
        }
        Returns: string
      }
      portal_add_pickup: {
        Args: {
          p_family_id: string
          p_name: string
          p_phone: string
          p_relation: string
        }
        Returns: string
      }
      portal_can_edit_guardian: {
        Args: { p_guardian_id: string }
        Returns: boolean
      }
      portal_can_edit_student: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      portal_can_edit_week_plan: {
        Args: { p_class_id: string; p_school_year_id: string }
        Returns: boolean
      }
      portal_can_mark: {
        Args: { p_school_day_id: string; p_student_id: string }
        Returns: boolean
      }
      portal_can_report_absence: {
        Args: { p_school_day_id: string; p_student_id: string }
        Returns: boolean
      }
      portal_can_mark_lesson: {
        Args: { p_lesson_id: string; p_student_id: string }
        Returns: boolean
      }
      portal_can_read_lesson: {
        Args: { p_lesson_id: string }
        Returns: boolean
      }
      portal_can_read_week_plan: {
        Args: { p_class_id: string; p_school_year_id: string }
        Returns: boolean
      }
      portal_can_write_attendance: {
        Args: { p_school_day_id: string; p_student_id: string }
        Returns: boolean
      }
      portal_can_write_lesson_attendance: {
        Args: { p_lesson_id: string; p_student_id: string }
        Returns: boolean
      }
      portal_class_roster: {
        Args: { p_class_id: string; p_school_day_id: string }
        Returns: {
          absence_reason: string
          absence_report_id: string
          allergies: string
          attendance_marked_at: string
          attendance_status: string
          birth_date: string
          first_name: string
          guardians: Json
          last_name: string
          medical_notes: string
          photo_consent: boolean
          pickup: Json
          student_id: string
        }[]
      }
      portal_diff: { Args: { p_new: Json; p_old: Json }; Returns: Json }
      portal_end_substitute: {
        Args: { p_class_id: string }
        Returns: undefined
      }
      portal_guardian_ids: { Args: never; Returns: string[] }
      portal_is_active_year_day: {
        Args: { p_school_day_id: string }
        Returns: boolean
      }
      portal_is_guardian_in_class: {
        Args: { p_class_id: string }
        Returns: boolean
      }
      portal_is_guardian_of: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      portal_is_open_school_day: {
        Args: { p_school_day_id: string }
        Returns: boolean
      }
      portal_is_student_in_class: {
        Args: { p_class_id: string }
        Returns: boolean
      }
      portal_is_substitute_of: {
        Args: { p_class_id: string }
        Returns: boolean
      }
      portal_is_teacher_of: { Args: { p_class_id: string }; Returns: boolean }
      portal_is_uncancelled_day: {
        Args: { p_school_day_id: string }
        Returns: boolean
      }
      portal_lesson_roster: {
        Args: { p_lesson_id: string }
        Returns: {
          absence_reason: string
          absence_report_id: string
          absence_source: string
          allergies: string
          attendance_marked_at: string
          attendance_status: string
          birth_date: string
          first_name: string
          guardians: Json
          last_name: string
          medical_notes: string
          photo_consent: boolean
          pickup: Json
          student_id: string
        }[]
      }
      portal_lessons: {
        Args: { p_school_day_ids: string[] }
        Returns: {
          cancelled: boolean
          class_id: string
          class_name_en: string
          class_name_no: string
          co_teacher_first_name: string
          co_teacher_guardian_id: string
          co_teacher_last_name: string
          date: string
          end_label: string
          end_position: number
          ends_at: string
          is_mine: boolean
          is_substitute: boolean
          lesson_id: string
          note: string
          school_day_id: string
          start_label: string
          start_position: number
          starts_at: string
          subject: string
          teacher_first_name: string
          teacher_guardian_id: string
          teacher_last_name: string
        }[]
      }
      portal_log_change: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_family_id: string
          p_metadata: Json
        }
        Returns: undefined
      }
      portal_login_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      portal_my_children: {
        Args: never
        Returns: {
          birth_date: string
          class_id: string
          class_name_en: string
          class_name_no: string
          first_name: string
          last_name: string
          remaining_ore: number
          school_year_id: string
          school_year_label: string
          student_id: string
          teachers: Json
        }[]
      }
      portal_my_classes: {
        Args: never
        Returns: {
          class_id: string
          name_en: string
          name_no: string
          role: string
          school_year_id: string
          school_year_label: string
          student_count: number
          substitute_until: string
        }[]
      }
      portal_my_economy: { Args: never; Returns: Json }
      portal_my_families: { Args: never; Returns: Json }
      portal_my_family_ids: { Args: never; Returns: string[] }
      portal_my_lessons: {
        Args: { p_from: string; p_to: string }
        Returns: {
          cancelled: boolean
          class_id: string
          class_name_en: string
          class_name_no: string
          co_teacher_first_name: string
          co_teacher_guardian_id: string
          co_teacher_last_name: string
          date: string
          end_label: string
          end_position: number
          ends_at: string
          is_mine: boolean
          is_substitute: boolean
          lesson_id: string
          note: string
          school_day_id: string
          start_label: string
          start_position: number
          starts_at: string
          subject: string
          teacher_first_name: string
          teacher_guardian_id: string
          teacher_last_name: string
        }[]
      }
      portal_my_self: {
        Args: never
        Returns: {
          attendance: Json
          birth_date: string
          class_id: string
          class_name_en: string
          class_name_no: string
          first_name: string
          last_name: string
          notes: Json
          school_year_id: string
          school_year_label: string
          student_id: string
          teachers: Json
        }[]
      }
      portal_remove_guardian: {
        Args: { p_family_id: string; p_guardian_id: string }
        Returns: string
      }
      portal_remove_pickup: { Args: { p_id: string }; Returns: undefined }
      portal_set_continues: {
        Args: { p_continues: boolean | null; p_student_id: string }
        Returns: undefined
      }
      portal_start_substitute: { Args: { p_class_id: string }; Returns: string }
      portal_student_ids: { Args: never; Returns: string[] }
      portal_substitute_options: {
        Args: never
        Returns: {
          class_id: string
          name_en: string
          name_no: string
          student_count: number
        }[]
      }
      portal_sync_family_contacts: {
        Args: { p_family_id: string }
        Returns: undefined
      }
      portal_teacher_guardian_id: { Args: never; Returns: string }
      portal_teaches_lesson: { Args: { p_lesson_id: string }; Returns: boolean }
      portal_teaches_student: {
        Args: { p_student_id: string }
        Returns: boolean
      }
      portal_update_child: {
        Args: {
          p_birth_date: string
          p_email: string | null
          p_first_name: string
          p_gender: string
          p_last_name: string
          p_level_arabic: string | null
          p_level_islam: string | null
          p_level_quran: string | null
          p_phone: string | null
          p_student_id: string
        }
        Returns: undefined
      }
      portal_update_child_health: {
        Args: {
          p_allergies: string | null
          p_medical_notes: string | null
          p_photo_consent: boolean | null
          p_student_id: string
        }
        Returns: undefined
      }
      portal_update_family_address: {
        Args: {
          p_address: string
          p_city: string
          p_family_id: string
          p_postal_code: string
        }
        Returns: undefined
      }
      portal_update_family_guardian: {
        Args: {
          p_family_id: string
          p_first_name: string
          p_guardian_id: string
          p_last_name: string
          p_phone: string | null
          p_receives_communication: boolean
          p_relationship_label: string
        }
        Returns: undefined
      }
      portal_update_family_preferences: {
        Args: { p_family_id: string; p_preferred_language: string }
        Returns: undefined
      }
      portal_update_guardian: {
        Args: {
          p_first_name: string
          p_guardian_id: string
          p_last_name: string
          p_phone: string
        }
        Returns: undefined
      }
      portal_update_pickup: {
        Args: {
          p_id: string
          p_name: string
          p_phone: string | null
          p_relation: string | null
        }
        Returns: undefined
      }
      portal_valid_phone: { Args: { p_phone: string }; Returns: boolean }
      reconcile_lessons: {
        Args: { p_class_id?: string; p_school_year_id: string }
        Returns: number
      }
      replace_payment_allocations: {
        Args: { p_allocations?: Json; p_payment_id: string }
        Returns: number
      }
      rollover_enrollments: {
        Args: { p_from_year: string; p_rows: Json; p_to_year: string }
        Returns: Json
      }
      seed_default_time_slots: {
        Args: { p_school_year_id: string }
        Returns: number
      }
      set_active_school_year: {
        Args: { p_school_year_id: string }
        Returns: undefined
      }
      update_family_relationships: {
        Args: {
          p_family: Json
          p_family_id: string
          p_guardians: Json
          p_resolve_reviews?: boolean
        }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

