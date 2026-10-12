/**
 * Database types for migration 20261012200000, written by hand in the format
 * produced by `supabase gen types typescript`. Regenerate (or update by hand)
 * whenever a migration changes these tables or functions.
 *
 * `type` aliases (not interfaces) are required: supabase-js checks these
 * against index-signature types.
 */
export type Database = {
  public: {
    Tables: {
      work_records: {
        Row: {
          id: string;
          title: string;
          category: string;
          summary: string;
          deliverables: string[];
          start_date: string;
          end_date: string;
          client_name: string;
          client_organization: string | null;
          client_email: string;
          amount: number | null;
          currency: string | null;
          status: string;
          decided_by_name: string | null;
          decision_note: string | null;
          decided_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Only these columns are insertable by service_role. */
        Insert: {
          title: string;
          category: string;
          summary: string;
          deliverables?: string[];
          start_date: string;
          end_date: string;
          client_name: string;
          client_organization?: string | null;
          client_email: string;
          amount?: number | null;
          currency?: string | null;
        };
        /** No direct updates: use the database functions. */
        Update: Record<string, never>;
        Relationships: [];
      };
      confirmation_requests: {
        Row: {
          id: string;
          record_id: string;
          token_hash: string;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        /** No direct inserts: use issue_confirmation_request(). */
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "confirmation_requests_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "work_records";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      issue_confirmation_request: {
        Args: { p_record_id: string; p_token_hash: string; p_expires_at: string };
        Returns: string;
      };
      submit_confirmation_decision: {
        Args: {
          p_token_hash: string;
          p_decision: string;
          p_decided_by: string;
          p_note?: string | null;
        };
        Returns: { outcome: string; work_record_id: string | null }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
