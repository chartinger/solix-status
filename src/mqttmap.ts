/**
 * Anker Solix MQTT field maps (TypeScript port of mqttmap.py).
 *
 * Structure: SOLIXMQTTMAP[modelPN][msgTypeHex] = FieldMap
 *
 * modelPN  — device model/product number, e.g. "A17C1"
 * msgType  — 2-byte message type as lowercase hex, e.g. "0405"
 * FieldMap — Record<fieldIdHex, FieldDescriptor>
 *
 * Only a representative subset of device models is included here. Pull
 * requests with additional maps are welcome; the structure mirrors the Python
 * reference implementation (thomluther/anker-solix-api:api/mqttmap.py).
 *
 * Field type bytes (FieldType.*):
 *   0x00 str  — UTF-8 string
 *   0x01 ui   — 1-byte unsigned int
 *   0x02 sile — 2-byte signed int LE
 *   0x03 var  — 4-byte polymorphic
 *   0x04 bin  — bitmask / sub-field byte pattern
 *   0x05 sfle — 4-byte float LE
 *   0x06 strb — sequential mixed sub-fields
 */

import type { FieldMap } from "./mqtt-packet.js";
import { FieldType } from "./mqtt-packet.js";

// ─────────────────────────────────────────────────────────────────────────────
// Shared / reusable sub-maps
// ─────────────────────────────────────────────────────────────────────────────

const F8_DC_AC: FieldMap["f8"] = {
  bytes: {
    "0": { name: "dc_12v_output_mode", type: FieldType.ui },
    "1": { name: "ac_output_mode", type: FieldType.ui },
  },
};

const F8_DC_ONLY: FieldMap["f8"] = {
  bytes: {
    "0": { name: "dc_12v_output_mode", type: FieldType.ui },
  },
};

const TIMESTAMP_FE: FieldMap["fe"] = { name: "msg_timestamp" };

// ─────────────────────────────────────────────────────────────────────────────
// C300 AC (A1722)
// ─────────────────────────────────────────────────────────────────────────────

const A1722_0405: FieldMap = {
  topic: { topic: "param_info" },
  a4: { name: "remaining_time_hours", factor: 0.1, signed: false },
  a7: { name: "usbc_1_power" },
  a8: { name: "usbc_2_power" },
  a9: { name: "usbc_3_power" },
  aa: { name: "usba_1_power" },
  ac: { name: "dc_input_power_total" },
  ad: { name: "ac_input_power_total" },
  ae: { name: "ac_output_power_total" },
  b7: { name: "ac_output_power_switch" },
  b8: { name: "dc_charging_status" },
  b9: { name: "temperature", signed: true },
  ba: { name: "charging_status" },
  bb: { name: "battery_soc" },
  bc: { name: "battery_soh" },
  c1: { name: "dc_output_power_switch" },
  c5: { name: "device_sn" },
  c6: { name: "ac_input_limit" },
  cf: { name: "display_mode" },
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// C200 DC (A1725 / A1727)
// ─────────────────────────────────────────────────────────────────────────────

const A1725_0401: FieldMap = {
  topic: { topic: "param_info" },
  a1: { name: "device_pn" },
  a4: { name: "display_switch" },
};

const A1725_0405: FieldMap = {
  topic: { topic: "param_info" },
  a1: { name: "device_pn" },
  a3: { name: "remaining_time_hours", factor: 0.1, signed: false },
  a4: { name: "usbc_1_power" },
  a5: { name: "usbc_2_power" },
  a6: { name: "usbc_3_power" },
  a8: { name: "usba_1_power" },
  a9: { name: "usba_2_power" },
  ab: { name: "photovoltaic_power" },
  ac: { name: "dc_input_power_total" },
  ad: { name: "dc_output_power_total" },
  af: { name: "battery_soc_ah", factor: 0.001 },
  b5: { name: "temperature", signed: true },
  b6: { name: "charging_status" },
  b7: { name: "battery_soc" },
  b8: { name: "battery_soh" },
  b9: { name: "usbc_1_status" },
  ba: { name: "usbc_2_status" },
  bb: { name: "usbc_3_status" },
  bd: { name: "usba_1_status" },
  be: { name: "usba_2_status" },
  c3: { name: "device_sn" },
  c4: { name: "device_timeout_minutes" },
  c5: { name: "display_timeout_seconds" },
  c7: { name: "display_mode" },
  c9: { name: "temp_unit_fahrenheit" },
  ca: { name: "display_switch" },
  cd: { name: "charging_status" },
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// C300 DC (A1728)
// ─────────────────────────────────────────────────────────────────────────────

const A1728_0401: FieldMap = {
  topic: { topic: "param_info" },
  a2: { name: "dc_12v_1_status" },
  a3: { name: "light_mode" },
  a4: { name: "display_switch" },
};

const A1728_0404: FieldMap = {
  topic: { topic: "param_info" },
  a2: { name: "dc_output_timeout_seconds" },
};

const A1728_0405: FieldMap = {
  topic: { topic: "param_info" },
  a2: { name: "dc_output_timeout_seconds" },
  a3: { name: "remaining_time_hours", factor: 0.1, signed: false },
  a4: { name: "usbc_1_power" },
  a5: { name: "usbc_2_power" },
  a6: { name: "usbc_3_power" },
  a7: { name: "usbc_4_power" },
  a8: { name: "usba_1_power" },
  a9: { name: "usba_2_power" },
  aa: { name: "dc_12v_1_power" },
  ab: { name: "photovoltaic_power" },
  ac: { name: "dc_input_power_total" },
  ad: { name: "dc_output_power_total" },
  af: { name: "battery_soc_ah", factor: 0.001 },
  b0: { name: "sw_version", values: 1 },
  b5: { name: "temperature", signed: true },
  b6: { name: "charging_status" },
  b7: { name: "battery_soc" },
  b8: { name: "battery_soh" },
  b9: { name: "usbc_1_status" },
  ba: { name: "usbc_2_status" },
  bb: { name: "usbc_3_status" },
  bc: { name: "usbc_4_status" },
  bd: { name: "usba_1_status" },
  be: { name: "usba_2_status" },
  bf: { name: "dc_12v_1_status" },
  c1: { name: "overload_event" },
  c3: { name: "device_sn" },
  c4: { name: "device_timeout_minutes" },
  c5: { name: "display_timeout_seconds" },
  c7: { name: "display_mode" },
  c8: { name: "light_mode" },
  c9: { name: "temp_unit_fahrenheit" },
  ca: { name: "display_switch" },
  cb: { name: "light_timeout_minutes" },
  cd: { name: "charging_status" },
  f7: { name: "dc_12v_auto_on" },
  f8: F8_DC_ONLY,
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// C1000 / C1000X (A1761)
// ─────────────────────────────────────────────────────────────────────────────

const A1761_0405: FieldMap = {
  topic: { topic: "param_info" },
  a4: { name: "remaining_time_hours", factor: 0.1, signed: false },
  a5: { name: "ac_input_power" },
  a6: { name: "ac_output_power" },
  a7: { name: "usbc_1_power" },
  a8: { name: "usbc_2_power" },
  a9: { name: "usba_1_power" },
  aa: { name: "usba_2_power" },
  ae: { name: "dc_input_power" },
  af: { name: "photovoltaic_power" },
  b0: { name: "output_power_total" },
  b3: { name: "sw_version", values: 1 },
  b9: { name: "sw_expansion", values: 1 },
  ba: { name: "sw_controller", values: 1 },
  bb: { name: "ac_output_power_switch" },
  bd: { name: "temperature", signed: true },
  be: { name: "exp_1_temperature", signed: true },
  c1: { name: "main_battery_soc" },
  c2: { name: "exp_1_soc" },
  c3: { name: "battery_soh" },
  c4: { name: "exp_1_soh" },
  c5: { name: "expansion_packs" },
  d0: { name: "device_sn" },
  d1: { name: "ac_input_limit" },
  d2: { name: "device_timeout_minutes" },
  d3: { name: "display_timeout_seconds" },
  d8: { name: "dc_output_power_switch" },
  d9: { name: "display_mode" },
  da: { name: "ac_frequency" },
  dc: { name: "light_mode" },
  dd: { name: "temp_unit_fahrenheit" },
  de: { name: "display_switch" },
  e5: { name: "backup_charge_switch" },
  f8: F8_DC_AC,
  fd: { name: "exp_1_type" },
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// C1000 Gen2 (A1763 / A1783)
// ─────────────────────────────────────────────────────────────────────────────

const A1763_0421: FieldMap = {
  topic: { topic: "param_info" },
  a2: {
    bytes: {
      "1": { name: "device_sn", type: FieldType.str },
      "32": { name: "device_pn", type: FieldType.str },
    },
  },
  a4: {
    bytes: {
      "0": { name: "ac_output_timeout_seconds", type: FieldType.var, length: 4 },
      "4": { name: "ac_input_limit", type: FieldType.sile },
      "6": { name: "ac_frequency", type: FieldType.ui },
      "7": { name: "ac_output_mode", type: FieldType.ui },
      "8": { name: "dc_output_timeout_seconds", type: FieldType.var, length: 4 },
      "18": { name: "dc_12v_output_mode", type: FieldType.ui },
      "19": { name: "device_timeout_minutes", type: FieldType.sile },
      "21": { name: "display_timeout_seconds", type: FieldType.sile },
      "23": { name: "display_mode", type: FieldType.ui },
      "25": { name: "temp_unit_fahrenheit", type: FieldType.ui },
      "32": { name: "ac_fast_charge_switch", type: FieldType.ui },
      "33": { name: "display_switch", type: FieldType.ui },
      "34": { name: "port_memory_switch", type: FieldType.ui },
    },
  },
  a5: {
    bytes: {
      "0": { name: "temperature", signed: true, type: FieldType.ui },
      "2": { name: "battery_soc", type: FieldType.ui },
      "6": { name: "output_power_total", type: FieldType.sile },
      "8": { name: "ac_input_power", type: FieldType.sile },
    },
  },
  a6: {
    bytes: {
      "0": { name: "ac_output_power", type: FieldType.sile },
      "2": { name: "dc_input_power", type: FieldType.sile },
    },
  },
  a7: {
    bytes: {
      "0": { name: "ac_output_power_switch", type: FieldType.ui },
    },
  },
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// Solarbank 2 (A17C1)
// ─────────────────────────────────────────────────────────────────────────────

const A17C1_0405: FieldMap = {
  topic: { topic: "param_info" },
  a2: { name: "device_sn" },
  a3: { name: "main_battery_soc" },
  a5: { name: "error_code" },
  a6: { name: "sw_version", values: 4 },
  a7: { name: "sw_controller", values: 4 },
  a8: { name: "sw_expansion", values: 4 },
  a9: { name: "temp_unit_fahrenheit" },
  aa: { name: "temperature", signed: true },
  ab: { name: "photovoltaic_power", factor: 0.1 },
  ac: { name: "ac_output_power", factor: 0.1 },
  ad: { name: "battery_soc" },
  b0: { name: "bat_charge_power", factor: 0.01 },
  b1: { name: "pv_yield", factor: 0.0001 },
  b2: { name: "charged_energy", factor: 0.00001 },
  b3: { name: "output_energy", factor: 0.0001 },
  b4: { name: "output_cutoff_data" },
  b5: { name: "lowpower_input_data" },
  b6: { name: "input_cutoff_data" },
  b7: { name: "bat_discharge_power", factor: 0.01 },
  bc: { name: "grid_to_home_power", factor: 0.1 },
  bd: { name: "pv_to_grid_power", factor: 0.1 },
  be: { name: "grid_import_energy", factor: 0.0001 },
  bf: { name: "grid_export_energy", factor: 0.0001 },
  c2: { name: "max_load" },
  c4: { name: "home_demand", factor: 0.1 },
  c6: { name: "usage_mode" },
  c7: { name: "home_load_preset" },
  c8: { name: "ac_socket_power", factor: 0.1 },
  c9: { name: "consumed_energy", factor: 0.0001 },
  ca: { name: "pv_1_power", factor: 0.1 },
  cb: { name: "pv_2_power", factor: 0.1 },
  cc: { name: "pv_3_power", factor: 0.1 },
  cd: { name: "pv_4_power", factor: 0.1 },
  d2: { name: "light_mode" },
  d3: { name: "output_power", factor: 0.1 },
  e0: { name: "grid_status" },
  e1: { name: "light_off_switch" },
  e8: { name: "battery_heating" },
  fb: {
    bytes: {
      "0": [{ name: "grid_export_disabled", mask: 0x01 }],
    },
  },
  fe: TIMESTAMP_FE,
};

const A17C1_0408: FieldMap = {
  topic: { topic: "state_info" },
  a2: { name: "device_sn" },
  a3: { name: "local_timestamp" },
  a4: { name: "utc_timestamp" },
  a8: { name: "charging_status" },
  b0: { name: "battery_soc" },
  b6: { name: "temperature", signed: true },
  b7: { name: "usage_mode" },
  b8: { name: "home_load_preset" },
  c1: { name: "ac_output_power", factor: 0.1 },
  c3: { name: "grid_import_energy", factor: 0.0001 },
  c4: { name: "grid_export_energy", factor: 0.0001 },
  c8: { name: "home_demand", factor: 0.1 },
  ce: { name: "pv_1_power" },
  cf: { name: "pv_2_power" },
  d0: { name: "pv_3_power" },
  d1: { name: "pv_4_power" },
};

const A17C1_040a: FieldMap = {
  topic: { topic: "param_info" },
  a2: { name: "expansion_packs" },
  a3: { name: "main_battery_soc" },
  a4: {
    bytes: {
      "0": { name: "exp_1_controller_sn", length: 17, type: FieldType.str },
      "25": { name: "exp_1_temperature", type: FieldType.ui, signed: true },
      "33": { name: "exp_1_soc", type: FieldType.ui },
      "34": { name: "exp_1_soh", type: FieldType.ui },
      "39": { name: "exp_1_sn", length: 17, type: FieldType.str },
    },
  },
  a5: {
    bytes: {
      "0": { name: "exp_2_controller_sn", length: 17, type: FieldType.str },
      "25": { name: "exp_2_temperature", type: FieldType.ui, signed: true },
      "33": { name: "exp_2_soc", type: FieldType.ui },
      "34": { name: "exp_2_soh", type: FieldType.ui },
      "39": { name: "exp_2_sn", length: 17, type: FieldType.str },
    },
  },
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// Solarbank 3 (A17C5)
// ─────────────────────────────────────────────────────────────────────────────

const A17C5_0405: FieldMap = {
  topic: { topic: "param_info" },
  a2: { name: "device_sn" },
  a3: { name: "main_battery_soc" },
  a5: { name: "temperature", signed: true },
  a6: { name: "battery_soc" },
  a7: { name: "sw_version", values: 4 },
  a8: { name: "sw_controller", values: 4 },
  a9: { name: "sw_expansion", values: 4 },
  ab: { name: "photovoltaic_power" },
  ac: { name: "battery_power_signed" },
  ad: { name: "output_power" },
  ae: { name: "ac_output_power_signed" },
  b0: { name: "pv_yield" },
  b1: { name: "charged_energy" },
  b2: { name: "discharged_energy" },
  b3: { name: "output_energy" },
  b4: { name: "consumed_energy" },
  b5: { name: "min_soc" },
  b8: { name: "usage_mode" },
  b9: { name: "home_load_preset" },
  fe: TIMESTAMP_FE,
};

// ─────────────────────────────────────────────────────────────────────────────
// Network / WiFi message (shared across PPS and Solarbank)
// ─────────────────────────────────────────────────────────────────────────────

const COMMON_0407: FieldMap = {
  topic: { topic: "state_info" },
  a2: { name: "device_sn" },
  a3: { name: "wifi_name" },
  a4: { name: "wifi_signal" },
};

const A17C1_0407: FieldMap = {
  ...COMMON_0407,
  a5: { name: "charging_status" },
};

// ─────────────────────────────────────────────────────────────────────────────
// Master map: SOLIXMQTTMAP[modelPN][msgTypeHex]
// ─────────────────────────────────────────────────────────────────────────────

export const SOLIXMQTTMAP: Record<string, Record<string, FieldMap>> = {
  // C300 AC
  A1722: {
    "0405": A1722_0405,
    "0407": COMMON_0407,
  },
  // C200 DC
  A1725: {
    "0401": A1725_0401,
    "0405": A1725_0405,
    "0407": COMMON_0407,
  },
  // C200X DC
  A1727: {
    "0401": A1725_0401,
    "0405": A1725_0405,
    "0407": COMMON_0407,
  },
  // C300 DC / C300X DC
  A1728: {
    "0401": A1728_0401,
    "0404": A1728_0404,
    "0405": A1728_0405,
    "0407": COMMON_0407,
  },
  // C1000 / C1000X
  A1761: {
    "0405": A1761_0405,
    "0407": COMMON_0407,
  },
  // C1000 Gen2 / C1000X Gen2
  A1763: {
    "0405": A1761_0405,
    "0421": A1763_0421,
    "0407": COMMON_0407,
  },
  A1783: {
    "0405": A1761_0405,
    "0421": A1763_0421,
    "0407": COMMON_0407,
  },
  // Solarbank 2
  A17C1: {
    "0405": A17C1_0405,
    "0407": A17C1_0407,
    "0408": A17C1_0408,
    "040a": A17C1_040a,
  },
  // Solarbank 3
  A17C5: {
    "0405": A17C5_0405,
  },
};

/**
 * Look up the field map for a given device model and message type.
 *
 * @param pn      - Device product number / model (e.g. "A17C1").
 * @param msgType - 2-byte message type as lowercase hex (e.g. "0405").
 * @returns The matching FieldMap or `undefined` if none is registered.
 */
export function getFieldMap(pn: string, msgType: string): FieldMap | undefined {
  return SOLIXMQTTMAP[pn]?.[msgType.toLowerCase()];
}
