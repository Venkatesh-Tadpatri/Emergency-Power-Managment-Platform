export interface Reseller {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  status: string;
}

export interface Company {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  reseller_id: string;
  status: string;
  logo_data?: string | null;
}

export interface Site {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  customer_id: string;
  status: string;
}

export interface System {
  id: string;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  company_id: string;
  site_id: string;
  site_name?: string | null;
  status: "normal" | "emergency" | "alarm" | "test" | "offline" | string;
}

export interface Panel {
  id: string;
  name: string;
  panel_mqtt_id?: string | null;
  system_id: string;
  connection_status: string;
}

export interface ATS {
  id: string;
  name: string;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  branch: "life-safety" | "critical" | "equipment" | string;
  source_type?: "utility" | "generator" | string;
  rated_amps?: number | null;
  rated_volts?: number | null;
  mqtt_topic?: string | null;
  panel_id: string;
}

export interface Generator {
  id: string;
  name: string;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  rated_volts?: number | null;
  rated_amps?: number | null;
  rated_kw?: number | null;
  mqtt_topic?: string | null;
  panel_id: string;
}

export interface Alarm {
  id: string;
  system_id: string;
  device_label?: string | null;
  severity: "critical" | "warning" | "info" | string;
  message: string;
  status: "active" | "cleared" | string;
  occurred_at: string;
  ack_by?: string | null;
  ack_at?: string | null;
}

export interface AtsTransferDetail {
  ats_name: string;
  branch?: string | null;
  manufacturer?: string | null;
  serial_number?: string | null;
  switched_to_emergency?: string | null;
  switched_to_normal?: string | null;
  time_to_bus_sec?: number | null;
  time_to_available_sec?: number | null;
  on_emergency_duration?: string | null;
}

export interface ReportListItem {
  id: string;
  company_id: string;
  system_id: string;
  report_code: string;
  type: "gen-run" | "ats-emergency" | "test" | string;
  report_date: string;
  time_label?: string | null;
  duration_label?: string | null;
  duration_min?: number | null;
  initiating_ats?: string | null;
  rated_kw?: number | null;
  peak_kw?: number | null;
  avg_kw?: number | null;
  event_type?: string | null;
  ats_details?: AtsTransferDetail[] | null;
}

export interface TelemetryLogRow {
  time: string;
  vab?: number | null;
  vbc?: number | null;
  vca?: number | null;
  ia?: number | null;
  ib?: number | null;
  ic?: number | null;
  kw?: number | null;
  pct_kw?: number | null;
  oil_psi?: number | null;
  water_temp_f?: number | null;
  batt_v?: number | null;
  hours?: number | null;
}

export interface ReportDetail extends ReportListItem {
  load_profile_data?: number[] | null;
  make?: string | null;
  model?: string | null;
  serial_number?: string | null;
  rated_voltage?: number | null;
  rated_amperage?: number | null;
  start_hours?: number | null;
  end_hours?: number | null;
  telemetry_log?: TelemetryLogRow[] | null;
}

export interface OnCallShift {
  id: string;
  company_id: string;
  shift_date: string;
  day_label: string;
  primary_name: string;
  secondary_name?: string | null;
  shift_label: string;
}

export interface Me {
  id: string;
  zitadel_sub: string;
  email: string;
  display_name?: string | null;
  role: string | null;
  scope_type: string | null;
  reseller_id: string | null;
  company_id: string | null;
  is_active: boolean;
  permissions: {
    manage_resellers: boolean;
    create_company: boolean;
    manage_company_users: boolean;
    manage_oncall: boolean;
    run_tests: boolean;
    is_scoped_to_own_company: boolean;
    has_role: boolean;
  };
}

export interface AppUser {
  id: string;
  zitadel_sub: string;
  email: string;
  display_name?: string | null;
  role: string | null;
  scope_type: string | null;
  reseller_id: string | null;
  company_id: string | null;
  is_active: boolean;
  assigned_system_ids: string[];
  assigned_site_ids: string[];
}
