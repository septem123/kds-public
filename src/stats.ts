/**
 * 击杀统计模块
 * 处理击杀数据的统计和分析
 */

import { Killmail, ParticipantStats, ShipTypeStats, CorporationStats } from './types';

export class KillmailStats {
  private stats: CorporationStats;
  private characterNames: Map<number, string> = new Map();

  constructor(corporationID: number, corporationName?: string) {
    this.stats = {
      corporationID,
      corporationName: corporationName || `Corp ${corporationID}`,
      totalKills: 0,
      participants: new Map(),
      shipTypes: new Map(),
      lastUpdated: new Date(),
    };
  }

  /**
   * 设置角色名称映射
   */
  setCharacterNames(names: Record<number, string>): void {
    this.characterNames.clear();
    for (const [id, name] of Object.entries(names)) {
      this.characterNames.set(parseInt(id, 10), name);
    }
  }

  /**
   * 获取角色名称
   */
  getCharacterName(characterID: number): string | undefined {
    return this.characterNames.get(characterID);
  }

  /**
   * 处理击杀数据并更新统计
   */
  processKillmail(killmail: Killmail): void {
    this.stats.totalKills++;

    // 检查 attackers 是否存在且可迭代
    if (!killmail.attackers || !Array.isArray(killmail.attackers)) {
      return;
    }

    // 统计每个攻击者
    for (const attacker of killmail.attackers) {
      // 只统计 corporationID 匹配的攻击者
      if (attacker.corporationID !== this.stats.corporationID) {
        continue;
      }

      const characterID = attacker.characterID;
      if (!characterID) continue;

      // 获取角色名称
      let characterName = this.getCharacterName(characterID);
      if (!characterName && attacker.characterName) {
        characterName = `${attacker.characterName} (${characterID})`;
      } else if (!characterName) {
        characterName = `Character_${characterID}`;
      }

      // 获取或创建参与者统计
      let participant = this.stats.participants.get(characterID);
      if (!participant) {
        participant = {
          characterID,
          characterName: characterName,
          corporationID: attacker.corporationID!,
          corporationName: attacker.corporationName || '',
          totalKills: 0,
          shipTypes: {},
          shipSignature: 0,
          finalBlows: 0,
        };
        this.stats.participants.set(characterID, participant);
      }

      // 如果之前没有名称，现在更新
      if (participant.characterName !== characterName && characterName) {
        participant.characterName = characterName;
      }

      // 更新击杀计数
      participant.totalKills++;

      // 统计船只类型
      const shipTypeID = attacker.shipTypeID;
      if (shipTypeID) {
        const shipName = attacker.shipTypeName || `Ship ${shipTypeID}`;
        const previousCount = participant.shipTypes[shipName] || 0;
        participant.shipTypes[shipName] = previousCount + 1;
        
        // 统计签名数（新增船型）
        if (previousCount === 0) {
          participant.shipSignature++;
        }

        // 更新全局船只统计
        let shipStats = this.stats.shipTypes.get(shipTypeID);
        if (!shipStats) {
          shipStats = {
            shipTypeID,
            shipTypeName: shipName,
            totalKills: 0,
            participants: {},
          };
          this.stats.shipTypes.set(shipTypeID, shipStats);
        }
        shipStats.totalKills++;

        // 更新使用该船只的参与者
        shipStats.participants[characterID] = (shipStats.participants[characterID] || 0) + 1;
      }

      // 统计 Final Blow
      if (attacker.finalBlow) {
        participant.finalBlows++;
      }
    }
  }

  /**
   * 处理多个击杀数据
   */
  processKillmails(killmails: Killmail[]): void {
    console.log(`正在处理 ${killmails.length} 条击杀记录...`);
    for (const killmail of killmails) {
      this.processKillmail(killmail);
    }
    console.log(`处理完成！`);
  }

  /**
   * 获取参与者排名
   */
  getParticipantRanking(options: { sortBy?: 'kills' | 'damage' | 'finalblows'; limit?: number } = {}): ParticipantStats[] {
    const { sortBy = 'kills', limit = 50 } = options;

    const participants = Array.from(this.stats.participants.values());

    // 排序
    participants.sort((a, b) => {
      switch (sortBy) {
        case 'finalblows':
          return b.finalBlows - a.finalBlows;
        default:
          return b.totalKills - a.totalKills;
      }
    });

    return participants.slice(0, limit);
  }

  /**
   * 获取船只类型排名
   */
  getShipTypeRanking(options: { limit?: number } = {}): ShipTypeStats[] {
    const { limit = 20 } = options;

    const shipTypes = Array.from(this.stats.shipTypes.values());

    shipTypes.sort((a, b) => b.totalKills - a.totalKills);

    return shipTypes.slice(0, limit);
  }

  /**
   * 获取特定参与者的船只使用统计
   */
  getParticipantShips(characterID: number): { shipType: string; count: number }[] {
    const participant = this.stats.participants.get(characterID);
    if (!participant) return [];

    return Object.entries(participant.shipTypes)
      .map(([shipType, count]) => ({ shipType, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
    * 获取统计摘要
    */
  getSummary() {
    return {
      corporationID: this.stats.corporationID,
      corporationName: this.stats.corporationName,
      totalKills: this.stats.totalKills,
      totalParticipants: this.stats.participants.size,
      totalShipTypes: this.stats.shipTypes.size,
      lastUpdated: this.stats.lastUpdated,
    };
  }

  /**
   * 导出为 JSON
   */
  toJSON(): string {
    const summary = this.getSummary();
    return JSON.stringify(summary, null, 2);
  }
}

/**
 * 创建统计实例
 */
export function createStats(corporationID: number, corporationName?: string): KillmailStats {
  return new KillmailStats(corporationID, corporationName);
}
