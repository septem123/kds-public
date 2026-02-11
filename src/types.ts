/**
 * EVE Online 击杀数据统计工具 - 类型定义
 */

export interface Killmail {
  killID: number;
  killTime: string;
  solarSystemID: number;
  solarSystemName?: string;
  regionID?: number;
  regionName?: string;
  moonID?: number;
  warID?: number;
  victim: Victim;
  attackers: Attacker[];
  zkb: ZkbInfo;
}

export interface Victim {
  characterID?: number;
  characterName?: string;
  corporationID?: number;
  corporationName?: string;
  allianceID?: number;
  allianceName?: string;
  factionID?: number;
  factionName?: string;
  shipTypeID?: number;
  shipTypeName?: string;
  damageTaken?: number;
}

export interface Attacker {
  characterID?: number;
  characterName?: string;
  corporationID?: number;
  corporationName?: string;
  allianceID?: number;
  allianceName?: string;
  factionID?: number;
  factionName?: string;
  shipTypeID?: number;
  shipTypeName?: string;
  weaponTypeID?: number;
  weaponTypeName?: string;
  damageDone?: number;
  finalBlow: boolean;
  securityStatus?: number;
}

export interface ZkbInfo {
  zkbOnly?: boolean;
  locationID?: number;
  hash?: string;
  fittedValue?: number;
  droppedValue?: number;
  destroyedValue?: number;
  totalValue?: number;
  points?: number;
  solo?: boolean;
  awox?: boolean;
}

export interface ParticipantStats {
  characterID: number;
  characterName: string;
  corporationID: number;
  corporationName: string;
  totalKills: number;
  shipTypes: Record<string, number>;  // 船型 -> 击杀数
  shipSignature: number;               // 使用过的船型数量（签名数）
  finalBlows: number;
}

export interface ShipTypeStats {
  shipTypeID: number;
  shipTypeName: string;
  totalKills: number;
  participants: Record<string, number>; // characterID -> count
}

export interface CorporationStats {
  corporationID: number;
  corporationName: string;
  totalKills: number;
  participants: Map<number, ParticipantStats>;
  shipTypes: Map<number, ShipTypeStats>;
  lastUpdated: Date;
}

export interface APIConfig {
  corporationID: number;
  maxPages?: number;
  requestDelayMs?: number;
  userAgent?: string;
}

export interface CLIOptions {
  corporationId: number;
  pages?: number;
  delay?: number;
  output?: 'table' | 'json' | 'csv';
  sortBy?: 'kills' | 'damage' | 'finalblows';
  topN?: number;
  solo?: boolean;
  wspace?: boolean;
  year?: number;
  month?: number;
  names?: boolean;
}

// ==================== API 响应类型 ====================

/** zKillboard API 列表响应 */
export interface ZKillboardListItem {
  killmail_id: number;
  zkb: {
    hash: string;
    locationID?: number;
    fittedValue?: number;
    droppedValue?: number;
    destroyedValue?: number;
    totalValue?: number;
    points?: number;
    solo?: boolean;
    awox?: boolean;
  };
}

/** ESI Killmail 响应 */
export interface ESIKillmailResponse {
  killmail_id: number;
  killmail_time: string;
  solar_system_id: number;
  victim?: {
    character_id?: number;
    corporation_id?: number;
    alliance_id?: number;
    faction_id?: number;
    ship_type_id?: number;
    damage_taken?: number;
  };
  attackers?: Array<{
    character_id?: number;
    corporation_id?: number;
    alliance_id?: number;
    faction_id?: number;
    ship_type_id?: number;
    weapon_type_id?: number;
    damage_done?: number;
    final_blow?: boolean;
    security_status?: number;
  }>;
}

/** GetKills 选项 */
export interface GetKillsOptions {
  page?: number;
  solo?: boolean;
  wspace?: boolean;
  year: number;
  month: number;
}

/** GetAllKills 过滤器 */
export interface KillFilters {
  solo?: boolean;
  wspace?: boolean;
  year: number;
  month: number;
}
