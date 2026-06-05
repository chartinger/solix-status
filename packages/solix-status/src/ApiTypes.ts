// ============================================================
// Anker API Response Types — generated from scene date response
// For reference only. These types are not used directly in the codebase.
// ============================================================

// --- Feature Switch ---
export interface FeatureSwitch {
  '0w_feed_v2': boolean;
  backup_reserve_effective: boolean;
  backup_reserve_enable: boolean;
  custom_rate_charge_enable: boolean;
  enable_aiems_v2: boolean;
  enable_parallel: boolean;
  enable_timeslot: boolean;
  exceed_power: boolean;
  heating: boolean;
  meter_self_testing: boolean;
  plug_switch_report: boolean;
  show_third_party_pv_panel: boolean;
  show_third_party_pv_to_home: boolean;
  soc_enable: boolean;
  support_AE100: boolean;
  support_p1_meter: boolean;
  third_party_pv_enable: boolean;
}

// --- PV Names ---
export interface PvName {
  micro_inverter_name: string;
  pv1_name: string;
  pv2_name: string;
  pv3_name: string;
  pv4_name: string;
}

// --- Backup Info ---
export interface BackupInfo {
  start_time: number;
  end_time: number;
  full_time: number;
}

// --- Use Time Execute Info ---
export interface UseTimeExecuteInfo {
  current_band: string;
}

// --- Solarbank Device ---
export interface SolarbankDevice {
  device_pn: string;
  device_sn: string;
  device_name: string;
  device_img: string;
  battery_power: string;
  bind_site_status: string;
  charging_power: string;
  power_unit: string;
  charging_status: string;
  status: string;
  wireless_type: string;
  main_version: string;
  photovoltaic_power: string;
  output_power: string;
  create_time: number;
  set_load_power: string;
  sub_package_num: number;
  output_cutoff_data: number;
  is_display: boolean;
  bat_charge_power: string;
  pv_name: PvName;
  pv_power: null;
  feature_switch: FeatureSwitch;
  heating_power: string;
  bat_discharge_power: string;
  err_code: number;
  priority: number;
  auto_switch: boolean;
  running_time: null;
}

// --- Solarbank Info ---
export interface SolarbankInfo {
  solarbank_list: SolarbankDevice[];
  total_charging_power: string;
  power_unit: string;
  charging_status: string;
  total_battery_power: string;
  updated_time: string;
  total_photovoltaic_power: string;
  total_output_power: string;
  display_set_power: boolean;
  battery_discharge_power: string;
  ac_power: string;
  to_home_load: string;
  is_display_data: boolean;
  solar_power_1: string;
  solar_power_2: string;
  solar_power_3: string;
  solar_power_4: string;
  other_input_power: string;
  micro_inverter_power: string;
  micro_inverter_power_limit: string;
  micro_inverter_low_power_limit: string;
  grid_to_battery_power: string;
  pei_heating_power: string;
  backup_info: BackupInfo;
  use_time_excute_info: UseTimeExecuteInfo;
}

// --- Home Info ---
export interface HomeInfo {
  home_name: string;
  home_img: string;
  charging_power: string;
  power_unit: string;
}

// --- PPS Info ---
export interface PpsInfo {
  pps_list: unknown[];
  total_charging_power: string;
  power_unit: string;
  total_battery_power: string;
  updated_time: string;
  pps_status: number;
}

// --- Statistic Entry ---
export interface StatisticEntry {
  type: string;
  total: string;
  unit: string;
}

// --- Grid Info ---
export interface GridInfo {
  grid_list: unknown[];
  photovoltaic_to_grid_power: string;
  grid_to_home_power: string;
  grid_status: number;
  has_history_data: boolean;
}

// --- Solarbank PPS Info ---
export interface SolarbankPpsInfo {
  pps_list: null;
  total_charging_power: string;
  total_output_power: string;
  total_battery_power: string;
  total_pv_input_power: string;
  total_home_load_power: string;
  total_grid_to_battery: string;
  home: null;
  grid: null;
  system: null;
}

// --- Combiner Box Info ---
export interface CombinerBoxInfo {
  combiner_box_list: unknown[];
}

// --- Charging Pile Info ---
export interface ChargingPileInfo {
  charging_pile_list: unknown[];
}

// --- Grid Entry (for grid_list items) ---
export interface GridEntry {
  // Not populated in sample, add fields as they appear
}

// --- Power Panel Entry ---
export interface PowerPanelEntry {
  // Not populated in sample, add fields as they appear
}

// --- Solar Entry ---
export interface SolarEntry {
  // Not populated in sample, add fields as they appear
}

// ============================================================
// Top-level Scene Date Response
// ============================================================
export interface SceneDateResponse {
  home_info: HomeInfo;
  solar_list: unknown[];
  pps_info: PpsInfo;
  statistics: StatisticEntry[];
  topology_type: string;
  solarbank_info: SolarbankInfo;
  retain_load: string;
  scene_mode: number;
  home_load_power: string;
  updated_time: string;
  power_site_type: number;
  site_id: string;
  powerpanel_list: unknown[];
  grid_info: GridInfo;
  is_downgrade: boolean;
  error_code: number;
  smart_plug_info: null;
  feature_switch: FeatureSwitch;
  other_loads_power: string;
  priority_discharge_switch: number;
  display_priority_discharge_tips: number;
  priority_discharge_upgrade_devices: string;
  style_id: number;
  is_show_priority_discharge: number;
  solarbank_pps_info: SolarbankPpsInfo;
  user_scene_mode: number;
  is_dynamic_price_down_grade: boolean;
  aiems_profit: null;
  switch_0w: number;
  err_msg: string;
  third_party_pv: string;
  combiner_box_info: CombinerBoxInfo;
  charging_pile_info: ChargingPileInfo;
  third_part_pv_setting: number;
  custom_charging_type: number;
}
