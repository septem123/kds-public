/**
 * zKillboard API 客户端
 * 用于获取击杀数据
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Killmail, APIConfig, ZKillboardListItem, ESIKillmailResponse, GetKillsOptions, KillFilters, LossFilters } from './types';
import { SHIP_NAMES } from './ship-names';

const ZKILLBOARD_BASE_URL = 'https://zkillboard.com/api';
const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const CACHE_DIR = path.join(process.cwd(), 'cache');

// ==================== 常量配置 ====================
const REQUEST_DELAY_MS = 100;          // 请求间隔基础值
const PAGE_DELAY_MS = 2000;           // 翻页间隔
const KILLMAIL_BATCH_DELAY_MS = 100;  // 获取 killmail 详情间隔
const MAX_RETRY_COUNT = 3;            // 最大重试次数

// 确保缓存目录存在
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(path.join(CACHE_DIR, 'killmails'), { recursive: true });
    await fs.mkdir(path.join(CACHE_DIR, 'characters'), { recursive: true });
  } catch (error) {
    // 目录已存在，忽略错误
  }
}

// 读取缓存
async function readCache<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// 保存缓存
async function saveCache<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export class ZKillboardAPI {
  private client: AxiosInstance;
  private esiClient: AxiosInstance;
  private config: Required<APIConfig>;

  constructor(config: APIConfig) {
    this.config = {
      corporationID: config.corporationID,
      maxPages: config.maxPages || 10,
      requestDelayMs: config.requestDelayMs || 1000,
      userAgent: config.userAgent || 'zkb-stats-tool',
    };

    // zKillboard API 客户端
    this.client = axios.create({
      baseURL: ZKILLBOARD_BASE_URL,
      headers: {
        'Accept-Encoding': 'gzip',
        'User-Agent': this.config.userAgent,
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    // ESI API 客户端（复用）
    this.esiClient = axios.create({
      baseURL: ESI_BASE_URL,
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: 60000,
    });

    // 配置重试逻辑
    axiosRetry(this.client, {
      retries: MAX_RETRY_COUNT,
      retryDelay: (retryCount) => retryCount * 1000,
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               (error.response?.status !== undefined && error.response.status === 429) ||
               (error.response?.status !== undefined && error.response.status >= 500);
      },
    });
  }

  /**
    * 获取 corporation 的击杀记录
    * API 端点格式: /api/kills/corporationID/{id}/[filters]/year/{Y}/month/{M}/page/{n}/
    * 使用缓存 + 限流处理
    */
  async getKills(options: GetKillsOptions): Promise<{ kills: Killmail[]; rawCount: number }> {
    const { page = 1, solo = false, wspace = false, year, month } = options;

    // 确保缓存目录存在
    await ensureCacheDir();

    // 构建缓存文件名: {corpId}-{year}-{month}[-solo][-wspace].json
    let cacheKey = `${this.config.corporationID}-${year}-${month.toString().padStart(2, '0')}`;
    if (solo) cacheKey += '-solo';
    if (wspace) cacheKey += '-wspace';

    // 构建 URL
    let url = `/kills/corporationID/${this.config.corporationID}/`;
    if (solo) url = `/solo${url}`;
    if (wspace) url = `/w-space${url}`;
    url += `year/${year}/month/${month}/`;
    url += `page/${page}/`;

    console.log(`Fetching: ${ZKILLBOARD_BASE_URL}${url}`);

    // 获取简化格式数据 (killmail_id + hash)
    const response = await this.client.get<ZKillboardListItem[]>(url);
    const data = response.data;

    if (!Array.isArray(data)) {
      return { kills: [], rawCount: 0 };
    }

    // 读取缓存
    const cacheFile = path.join(CACHE_DIR, 'killmails', `${cacheKey}.json`);
    const cached = await readCache<Record<number, Killmail>>(cacheFile);
    const cachedKillmails = cached || {};

    // 获取需要从 API 获取的 killmail ID
    const needFetch: { id: number; hash: string }[] = [];
    for (const item of data) {
      if (!cachedKillmails[item.killmail_id]) {
        needFetch.push({ id: item.killmail_id, hash: item.zkb.hash });
      }
    }

    // 打印进度
    console.log(`  [进度] ${data.length} 条, 缓存命中 ${data.length - needFetch.length}, 需获取 ${needFetch.length}`);

    // 获取缺失的 killmail 详情（带进度）
    let fetched = 0;
    const totalNeed = needFetch.length;
    for (const item of needFetch) {
      const killmail = await this.getESIKillmailDetail(item.id, item.hash);
      if (killmail) {
        cachedKillmails[item.id] = killmail;
      }
      fetched++;
      if (fetched % 10 === 0 || fetched === totalNeed) {
        console.log(`  [进度] 获取 Killmail 详情: ${fetched}/${totalNeed} (${Math.round(fetched / totalNeed * 100)}%)`);
      }
      // 请求间隔 100-200ms，避免触发限流
      await this.delay(100 + Math.random() * 100);
    }

    // 保存缓存
    await saveCache(cacheFile, cachedKillmails);
    console.log(`  [缓存] 已保存 ${Object.keys(cachedKillmails).length} 条到 ${path.basename(cacheFile)}`);

    // 返回有效数据
    const validKills = data
      .map(item => cachedKillmails[item.killmail_id])
      .filter((k): k is Killmail => k !== undefined);

    return { kills: validKills, rawCount: data.length };
  }

  /**
    * 获取 corporation 的损失记录
    * API 端点格式: /api/losses/corporationID/{id}/[filters]/year/{Y}/month/{M}/page/{n}/
    * 使用缓存 + 限流处理
    */
  async getLosses(options: GetKillsOptions): Promise<{ losses: Killmail[]; rawCount: number }> {
    const { page = 1, solo = false, wspace = false, year, month } = options;

    // 确保缓存目录存在
    await ensureCacheDir();

    // 构建缓存文件名: {corpId}-{year}-{month}[-solo][-wspace]-losses.json
    let cacheKey = `${this.config.corporationID}-${year}-${month.toString().padStart(2, '0')}`;
    if (solo) cacheKey += '-solo';
    if (wspace) cacheKey += '-wspace';
    cacheKey += '-losses';

    // 构建 URL (使用 losses 而不是 kills)
    let url = `/losses/corporationID/${this.config.corporationID}/`;
    if (solo) url = `/solo${url}`;
    if (wspace) url = `/w-space${url}`;
    url += `year/${year}/month/${month}/`;
    url += `page/${page}/`;

    console.log(`Fetching losses: ${ZKILLBOARD_BASE_URL}${url}`);

    // 获取简化格式数据 (killmail_id + hash)
    const response = await this.client.get<ZKillboardListItem[]>(url);
    const data = response.data;

    if (!Array.isArray(data)) {
      return { losses: [], rawCount: 0 };
    }

    // 读取缓存
    const cacheFile = path.join(CACHE_DIR, 'killmails', `${cacheKey}.json`);
    const cached = await readCache<Record<number, Killmail>>(cacheFile);
    const cachedLosses = cached || {};

    // 获取需要从 API 获取的 killmail ID
    const needFetch: { id: number; hash: string }[] = [];
    for (const item of data) {
      if (!cachedLosses[item.killmail_id]) {
        needFetch.push({ id: item.killmail_id, hash: item.zkb.hash });
      }
    }

    // 打印进度
    console.log(`  [进度] ${data.length} 条, 缓存命中 ${data.length - needFetch.length}, 需获取 ${needFetch.length}`);

    // 获取缺失的 killmail 详情（带进度）
    let fetched = 0;
    const totalNeed = needFetch.length;
    for (const item of needFetch) {
      const killmail = await this.getESIKillmailDetail(item.id, item.hash);
      if (killmail) {
        cachedLosses[item.id] = killmail;
      }
      fetched++;
      if (fetched % 10 === 0 || fetched === totalNeed) {
        console.log(`  [进度] 获取损失 Killmail 详情: ${fetched}/${totalNeed} (${Math.round(fetched / totalNeed * 100)}%)`);
      }
      // 请求间隔 100-200ms，避免触发限流
      await this.delay(100 + Math.random() * 100);
    }

    // 保存缓存
    await saveCache(cacheFile, cachedLosses);
    console.log(`  [缓存] 已保存 ${Object.keys(cachedLosses).length} 条损失记录到 ${path.basename(cacheFile)}`);

    // 返回有效数据
    const validLosses = data
      .map(item => cachedLosses[item.killmail_id])
      .filter((k): k is Killmail => k !== undefined);

    return { losses: validLosses, rawCount: data.length };
  }

  /**
    * 使用 ESI API 获取单个击杀的完整详情
    * ESI 是 EVE 官方的 Swagger API
    */
  async getESIKillmailDetail(killmailID: number, hash: string): Promise<Killmail | null> {
    try {
      const response = await this.esiClient.get<ESIKillmailResponse>(`/killmails/${killmailID}/${hash}/`);
      return this.transformESIResponse(killmailID, hash, response.data);
    } catch (error) {
      const err = error as AxiosError;
      console.error(`获取 Killmail ${killmailID} 失败: ${err.message}`);
      return null;
    }
  }

  /**
   * 转换 ESI 响应为我们的格式
   */
  private transformESIResponse(killmailID: number, hash: string, esiData: ESIKillmailResponse): Killmail {
    return {
      killID: killmailID,
      killTime: esiData.killmail_time,
      solarSystemID: esiData.solar_system_id,
      victim: {
        characterID: esiData.victim?.character_id,
        corporationID: esiData.victim?.corporation_id,
        allianceID: esiData.victim?.alliance_id,
        allianceName: `Alliance_${esiData.victim?.alliance_id}`,
        shipTypeID: esiData.victim?.ship_type_id,
        shipTypeName: this.getShipTypeName(esiData.victim?.ship_type_id),
        damageTaken: esiData.victim?.damage_taken,
      },
      attackers: (esiData.attackers || []).map((attacker, index: number) => ({
        characterID: attacker.character_id,
        corporationID: attacker.corporation_id,
        allianceID: attacker.alliance_id,
        allianceName: attacker.alliance_id ? `Alliance_${attacker.alliance_id}` : 'Unknown',
        shipTypeID: attacker.ship_type_id,
        shipTypeName: this.getShipTypeName(attacker.ship_type_id),
        weaponTypeID: attacker.weapon_type_id,
        damageDone: attacker.damage_done,
        finalBlow: attacker.final_blow || index === 0,
        securityStatus: attacker.security_status,
      })),
      zkb: {
        locationID: 0,
        hash: hash,
        fittedValue: 0,
        destroyedValue: esiData.victim?.damage_taken || 0,
        totalValue: esiData.victim?.damage_taken || 0,
        points: 0,
        solo: false,
        awox: false,
      },
    };
  }

  /**
   * 获取船型名称
   */
  private getShipTypeName(typeID?: number): string | undefined {
    if (!typeID) return undefined;
    return SHIP_NAMES[typeID] || `ShipType_${typeID}`;
  }

    /**
    * 获取所有击杀记录（带分页和延迟）
    * zKillboard API 每页最多返回 1000 条，翻页直到无数据为止
    */
  async getAllKills(filters: KillFilters): Promise<Killmail[]> {
    const allKills: Killmail[] = [];
    let page = 1;
    let hasMore = true;
    let totalRetrieved = 0;
    let totalRaw = 0;

    console.log(`开始获取 Corporation ${this.config.corporationID} 的击杀数据... [year=${filters.year}, month=${filters.month}]`);

    while (hasMore) {
      const result = await this.getKills({ page, ...filters });

      if (result.rawCount === 0) {
        // zKillboard API 返回空，说明已到最后一页
        console.log(`  Page ${page}: 无数据，停止翻页`);
        hasMore = false;
        break;
      }

      allKills.push(...result.kills);
      totalRetrieved += result.kills.length;
      totalRaw += result.rawCount;
      console.log(`  Page ${page}: 获取 ${result.kills.length}/${result.rawCount} 条 (累计有效: ${totalRetrieved}, 原始: ${totalRaw})`);

      page++;
      // 获取下一页前等待更长时间，避免触发限流
      await this.delay(PAGE_DELAY_MS);
    }

    console.log(`总计获取 ${allKills.length} 条有效击杀记录 (共 ${page - 1} 页)`);
    return allKills;
  }

  /**
    * 获取所有损失记录（带分页和延迟）
    * API 端点: /api/losses/corporationID/{id}/[filters]/year/{Y}/month/{M}/page/{n}/
    * zKillboard API 每页最多返回 1000 条，翻页直到无数据为止
    */
  async getAllLosses(filters: LossFilters): Promise<Killmail[]> {
    const allLosses: Killmail[] = [];
    let page = 1;
    let hasMore = true;
    let totalRetrieved = 0;
    let totalRaw = 0;

    console.log(`开始获取 Corporation ${this.config.corporationID} 的损失数据... [year=${filters.year}, month=${filters.month}]`);

    while (hasMore) {
      const result = await this.getLosses({ page, ...filters });

      if (result.rawCount === 0) {
        // zKillboard API 返回空，说明已到最后一页
        console.log(`  Page ${page}: 无数据，停止翻页`);
        hasMore = false;
        break;
      }

      allLosses.push(...result.losses);
      totalRetrieved += result.losses.length;
      totalRaw += result.rawCount;
      console.log(`  Page ${page}: 获取 ${result.losses.length}/${result.rawCount} 条 (累计有效: ${totalRetrieved}, 原始: ${totalRaw})`);

      page++;
      // 获取下一页前等待更长时间，避免触发限流
      await this.delay(PAGE_DELAY_MS);
    }

    console.log(`总计获取 ${allLosses.length} 条有效损失记录 (共 ${page - 1} 页)`);
    return allLosses;
  }

  /**
   * 获取特定时间范围内的击杀
   */
  async getKillsSince(seconds: number): Promise<Killmail[]> {
    const url = `/kills/corporationID/${this.config.corporationID}/pastSeconds/${seconds}/`;
    console.log(`Fetching kills since ${seconds} seconds: ${url}`);

    try {
      const response = await this.client.get<Killmail[]>(url);
      return response.data;
    } catch (error) {
      this.handleError(error as AxiosError);
      return [];
    }
  }

  /**
   * 获取特定 warID 的击杀
   */
  async getWarKills(warID: number): Promise<Killmail[]> {
    const url = `/kills/corporationID/${this.config.corporationID}/warID/${warID}/`;
    console.log(`Fetching war kills: ${url}`);

    try {
      const response = await this.client.get<Killmail[]>(url);
      return response.data;
    } catch (error) {
      this.handleError(error as AxiosError);
      return [];
    }
  }

  private handleError(error: AxiosError): void {
    if (error.response) {
      const status = error.response.status;
      const message = (error.response.data as any)?.message || error.message;

      switch (status) {
        case 429:
          console.error(`API 速率限制: ${message}`);
          break;
        case 403:
          console.error(`API 访问被拒绝: ${message}`);
          break;
        case 404:
          console.error(`未找到数据: ${message}`);
          break;
        default:
          console.error(`API 错误 (${status}): ${message}`);
      }
    } else if (error.request) {
      console.error(`网络错误: ${error.message}`);
    } else {
      console.error(`请求错误: ${error.message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
