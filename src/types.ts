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
  totalKills: number;          // 过滤后的击杀数（排除太空舱、移动牵引、我方损失+敌方finalBlow）
  rawTotalKills: number;       // 原始击杀数（仅排除 victim 是我方+finalBlow 非我方）
  participants: Map<number, ParticipantStats>;
  shipTypes: Map<number, ShipTypeStats>;
  lastUpdated: Date;
}

// ==================== 损失统计类型 ====================

/**
 * 损失统计参与者数据
 * 基于 Killmail.victim 统计
 */
export interface LossParticipantStats {
  characterID: number;
  characterName: string;
  corporationID: number;
  corporationName: string;
  totalLosses: number;
  shipTypes: Record<string, number>;  // 船型 -> 损失数
  totalValue: number;                // 总损失价值 (ISK)
  damageTaken: number;               // 总承受伤害
}

/**
 * 损失统计船只类型数据
 * 统计各类船型的损失情况
 */
export interface LossShipTypeStats {
  shipTypeID: number;
  shipTypeName: string;
  totalLosses: number;
  totalValue: number;                // 该船型总损失价值
  participants: Record<string, number>; // characterID -> 损失次数
}

/**
 * 损失统计数据聚合
 */
export interface LossStatisticsData {
  corporationID: number;
  corporationName: string;
  totalLosses: number;
  participants: Map<number, LossParticipantStats>;
  shipTypes: Map<number, LossShipTypeStats>;
  lastUpdated: Date;
}

/**
 * 损失记录过滤器
 */
export interface LossFilters {
  solo?: boolean;
  wspace?: boolean;
  year: number;
  month: number;
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
  sortBy?: 'kills' | 'damage' | 'finalblows' | 'losses' | 'value';
  topN?: number;
  solo?: boolean;
  wspace?: boolean;
  year?: number;
  month?: number;
  names?: boolean;
  losses?: boolean;
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
