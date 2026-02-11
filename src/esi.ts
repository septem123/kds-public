/**
 * ESI API 客户端
 * 用于获取角色名称、船只名称等
 */

import axios, { AxiosInstance } from 'axios';
import { promises as fs } from 'fs';
import * as path from 'path';

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const CACHE_DIR = path.join(process.cwd(), 'cache');
const CHARACTER_CACHE_FILE = path.join(CACHE_DIR, 'characters.json');

// 确保缓存目录存在
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch {
    // 目录已存在，忽略错误
  }
}

// 读取角色名称缓存
async function readCharacterCache(): Promise<Record<number, string>> {
  try {
    await ensureCacheDir();
    const content = await fs.readFile(CHARACTER_CACHE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// 保存角色名称缓存
async function saveCharacterCache(data: Record<number, string>): Promise<void> {
  await ensureCacheDir();
  await fs.writeFile(CHARACTER_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

interface ESIConfig {
  userAgent?: string;
}

interface CharacterInfo {
  character_id: number;
  name: string;
  corporation_id?: number;
  alliance_id?: number;
  faction_id?: number;
}

interface SearchResult {
  character: number[];
  corporation: number[];
  alliance: number[];
  faction: number[];
  solar_system: number[];
  constellation: number[];
  region: number[];
  type: number[];
  item: number[];
}

export class ESI {
  private client: AxiosInstance;
  private memoryCache: Map<number, string> = new Map();

  constructor(config: ESIConfig = {}) {
    this.client = axios.create({
      baseURL: ESI_BASE_URL,
      headers: {
        'User-Agent': config.userAgent || 'zkb-stats-tool',
      },
      timeout: 30000,
    });
  }

  /**
   * 批量获取角色名称（带缓存）
   * ESI API: POST /universe/names/
   * 一次最多 1000 个 ID
   */
  async getCharacterNames(characterIds: number[]): Promise<Record<number, string>> {
    if (characterIds.length === 0) return {};

    const fileCache = await readCharacterCache();
    const uncachedIds: number[] = [];
    const names: Record<number, string> = {};

    // 检查缓存
    for (const id of characterIds) {
      if (this.memoryCache.has(id)) {
        names[id] = this.memoryCache.get(id)!;
      } else if (fileCache[id]) {
        names[id] = fileCache[id];
        this.memoryCache.set(id, fileCache[id]);
      } else {
        uncachedIds.push(id);
      }
    }

    // 获取未缓存的角色
    if (uncachedIds.length > 0) {
      console.log(`  [角色缓存] 命中 ${characterIds.length - uncachedIds.length}/${characterIds.length}, 需获取 ${uncachedIds.length}`);

      for (let i = 0; i < uncachedIds.length; i += 1000) {
        const batch = uncachedIds.slice(i, i + 1000);
        const batchNames = await this.fetchNamesByIds(batch);
        Object.assign(names, batchNames);
        Object.assign(fileCache, batchNames);
      }

      await saveCharacterCache(fileCache);
      console.log(`  [角色缓存] 已保存 ${Object.keys(fileCache).length} 条`);
    }

    return names;
  }

  /**
   * 根据 ID 列表获取名称
   */
  private async fetchNamesByIds(ids: number[]): Promise<Record<number, string>> {
    if (ids.length === 0) {
      return {};
    }

    try {
      const response = await this.client.post<Array<{ category: string; id: number; name: string }>>(
        '/universe/names/',
        ids,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const names: Record<number, string> = {};
      for (const item of response.data) {
        // 只处理角色 (character) 类型的名称
        if (item.category === 'character') {
          names[item.id] = item.name;
          // 缓存
          this.memoryCache.set(item.id, item.name);
        }
      }

      return names;
    } catch (error: any) {
      console.error(`获取角色名称失败: ${error.message}`);
      return {};
    }
  }

  /**
   * 获取单个角色名称（带缓存）
   */
  async getCharacterName(characterId: number): Promise<string | undefined> {
    // 先检查缓存
    if (this.memoryCache.has(characterId)) {
      return this.memoryCache.get(characterId);
    }

    // 从 API 获取
    const names = await this.getCharacterNames([characterId]);
    return names[characterId];
  }

  /**
   * 搜索角色
   * ESI API: GET /search/
   */
  async searchCharacter(name: string): Promise<number[]> {
    try {
      const response = await this.client.get<SearchResult>('/search/', {
        params: {
          search: name,
          categories: 'character',
          strict: false,
        },
      });

      return response.data.character || [];
    } catch (error: any) {
      console.error(`搜索角色失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取角色信息
   * ESI API: GET /characters/{character_id}/
   */
  async getCharacterInfo(characterId: number): Promise<CharacterInfo | null> {
    try {
      const response = await this.client.get<CharacterInfo>(
        `/characters/${characterId}/`
      );
      return response.data;
    } catch (error: any) {
      console.error(`获取角色信息失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取角色所属 corporation 信息
   */
  async getCorporationInfo(corporationId: number): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/corporations/${corporationId}/`
      );
      return response.data;
    } catch (error: any) {
      console.error(`获取 Corporation 信息失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 获取角色所属 alliance 信息
   */
  async getAllianceInfo(allianceId: number): Promise<any | null> {
    try {
      const response = await this.client.get(
        `/alliances/${allianceId}/`
      );
      return response.data;
    } catch (error: any) {
      console.error(`获取 Alliance 信息失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.memoryCache.clear();
  }
}
