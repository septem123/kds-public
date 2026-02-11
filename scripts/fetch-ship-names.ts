/**
 * 从 ESI API 获取所有船型的完整中文数据
 *
 * 用法: npx ts-node scripts/fetch-ship-names.ts
 *
 * 正确的数据获取流程:
 * 1. 获取 ESI Category 6 (Ships) 下的所有 Groups
 * 2. 对每个 Group，调用 /universe/groups/{group_id}/types/ 获取船型列表
 * 3. 调用 ESI API 获取每个船型的完整中文数据
 * 4. 边获取边写入 JSON 文件
 *
 * 这样可以确保只获取真正的船型，不包含装备、涂装、无人机等
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const ESI_BASE_URL = 'https://esi.evetech.net/latest';
const OUTPUT_FILE = path.join(__dirname, '../src/data/ships-zh.json');
const USER_AGENT = 'zkb-ship-fetcher (contact@example.com)';

// ESI API 限制: 每秒最多 30 个请求
const REQUEST_DELAY_MS = 50;

// Ship Category ID
const SHIP_CATEGORY_ID = 6;

interface ShipInfo {
  type_id: number;
  name: string;
  description?: string;
  group_id?: number;
  mass?: number;
  volume?: number;
  capacity?: number;
  packaged_volume?: number;
  published?: boolean;
  icon_id?: number;
  graphic_id?: number;
  radius?: number;
  portion_size?: number;
}

interface CategoryInfo {
  category_id: number;
  groups: number[];
  name: string;
  published: boolean;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取 Ship Category 下的所有 Group IDs
 */
async function fetchShipGroups(): Promise<number[]> {
  console.log('📋 获取 Ship Category 下的所有 Groups...');

  const response = await axios.get<CategoryInfo>(
    `${ESI_BASE_URL}/universe/categories/${SHIP_CATEGORY_ID}/`,
    {
      headers: { 'User-Agent': USER_AGENT },
    }
  );

  console.log(`  发现 ${response.data.groups.length} 个 Group\n`);
  return response.data.groups;
}

/**
 * Group 信息接口
 */
interface GroupInfo {
  category_id: number;
  group_id: number;
  name: string;
  published: boolean;
  types: number[];
}

/**
 * 获取指定 Group 下的所有 Type IDs
 */
async function fetchGroupTypes(groupId: number): Promise<number[]> {
  try {
    const response = await axios.get<GroupInfo>(
      `${ESI_BASE_URL}/universe/groups/${groupId}/`,
      {
        headers: { 'User-Agent': USER_AGENT },
      }
    );
    return response.data.types || [];
  } catch (error: any) {
    console.error(`  ⚠️ 获取 Group ${groupId} 的 types 失败: ${error.message}`);
    return [];
  }
}

/**
 * 获取所有船型的 type_id 列表
 */
async function fetchAllShipTypeIds(): Promise<number[]> {
  console.log('🔍 开始获取所有船型 ID...\n');

  const groupIds = await fetchShipGroups();
  const allTypeIds: Set<number> = new Set();

  let processed = 0;
  for (const groupId of groupIds) {
    processed++;
    console.log(`  处理 Group ${processed}/${groupIds.length}: ID=${groupId}`);

    const types = await fetchGroupTypes(groupId);
    console.log(`    获取到 ${types.length} 个船型`);

    for (const typeId of types) {
      allTypeIds.add(typeId);
    }

    // 遵守 API 速率限制
    await delay(REQUEST_DELAY_MS);
  }

  const typeIdArray = Array.from(allTypeIds);
  console.log(`\n✅ 总共获取 ${typeIdArray.length} 个唯一船型 ID\n`);
  return typeIdArray;
}

/**
 * 转义 JSON 字符串中的特殊字符
 */
function escapeJsonString(str: string | undefined): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * 获取单个船型的完整中文信息
 */
async function fetchShipInfo(typeId: number): Promise<ShipInfo | null> {
  try {
    const response = await axios.get<any>(
      `${ESI_BASE_URL}/universe/types/${typeId}/`,
      {
        params: { language: 'zh' },
        headers: { 'User-Agent': USER_AGENT },
      }
    );

    const data = response.data;

    return {
      type_id: data.type_id || typeId,
      name: data.name || `Unknown_${typeId}`,
      description: data.description,
      group_id: data.group_id,
      mass: data.mass,
      volume: data.volume,
      capacity: data.capacity,
      packaged_volume: data.packaged_volume,
      published: data.published,
      icon_id: data.icon_id,
      graphic_id: data.graphic_id,
      radius: data.radius,
      portion_size: data.portion_size,
    };
  } catch (error: any) {
    if (error.response?.status === 404) {
      return { type_id: typeId, name: `Unknown_${typeId}` };
    }
    console.error(`  ⚠️ 获取 typeId=${typeId} 失败: ${error.message}`);
    return null;
  }
}

/**
 * 批量获取船型信息并流式写入
 */
async function fetchAndSaveShipData(typeIds: number[]): Promise<void> {
  console.log('🚀 开始获取完整船型数据...\n');

  // 确保输出目录存在
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 创建写入流
  const writeStream = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf-8' });

  // 写入 JSON 开始
  writeStream.write('{\n');
  writeStream.write('  "ships": {\n');

  let processed = 0;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < typeIds.length; i++) {
    const typeId = typeIds[i];

    // 进度报告 (每100个报告一次)
    if (processed % 100 === 0) {
      console.log(`  进度: ${processed}/${typeIds.length} (${((processed / typeIds.length) * 100).toFixed(1)}%)`);
    }

    const shipInfo = await fetchShipInfo(typeId);
    processed++;

    if (shipInfo) {
      // 构建 JSON 对象字符串
      const jsonParts: string[] = [];

      jsonParts.push(`"type_id": ${shipInfo.type_id}`);
      jsonParts.push(`"name": "${escapeJsonString(shipInfo.name)}"`);

      if (shipInfo.description !== undefined) {
        jsonParts.push(`"description": "${escapeJsonString(shipInfo.description)}"`);
      }
      if (shipInfo.group_id !== undefined) {
        jsonParts.push(`"group_id": ${shipInfo.group_id}`);
      }
      if (shipInfo.mass !== undefined) {
        jsonParts.push(`"mass": ${shipInfo.mass}`);
      }
      if (shipInfo.volume !== undefined) {
        jsonParts.push(`"volume": ${shipInfo.volume}`);
      }
      if (shipInfo.capacity !== undefined) {
        jsonParts.push(`"capacity": ${shipInfo.capacity}`);
      }
      if (shipInfo.packaged_volume !== undefined) {
        jsonParts.push(`"packaged_volume": ${shipInfo.packaged_volume}`);
      }
      if (shipInfo.published !== undefined) {
        jsonParts.push(`"published": ${shipInfo.published}`);
      }
      if (shipInfo.icon_id !== undefined) {
        jsonParts.push(`"icon_id": ${shipInfo.icon_id}`);
      }
      if (shipInfo.graphic_id !== undefined) {
        jsonParts.push(`"graphic_id": ${shipInfo.graphic_id}`);
      }
      if (shipInfo.radius !== undefined) {
        jsonParts.push(`"radius": ${shipInfo.radius}`);
      }
      if (shipInfo.portion_size !== undefined) {
        jsonParts.push(`"portion_size": ${shipInfo.portion_size}`);
      }

      const isLast = i === typeIds.length - 1;
      const comma = isLast ? '' : ',';

      writeStream.write(`    "${typeId}": {\n`);
      writeStream.write(`      ${jsonParts.join(',\n      ')}\n`);
      writeStream.write(`    }${comma}\n`);

      successCount++;
    } else {
      failedCount++;
    }

    // 遵守 API 速率限制
    await delay(REQUEST_DELAY_MS);
  }

  // 写入元数据
  writeStream.write('  },\n');
  writeStream.write('  "_meta": {\n');
  writeStream.write(`    "total": ${typeIds.length},\n`);
  writeStream.write(`    "success": ${successCount},\n`);
  writeStream.write(`    "failed": ${failedCount},\n`);
  writeStream.write(`    "source": "ESI Category 6 (Ships)",\n`);
  writeStream.write(`    "generatedAt": "${new Date().toISOString()}"\n`);
  writeStream.write('  }\n');
  writeStream.write('}\n');

  // 关闭写入流
  writeStream.end();

  // 等待写入完成
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });

  console.log('\n✅ 完成!');
  console.log(`📊 成功: ${successCount}, 失败: ${failedCount}`);
  console.log(`💾 输出文件: ${OUTPUT_FILE}`);
  console.log(`📁 文件大小: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('  EVE Online 完整船型数据获取工具');
  console.log('  数据来源: ESI API (Category 6: Ships, language=zh)');
  console.log('='.repeat(60));
  console.log();

  try {
    // 步骤 1: 获取所有船型 ID
    const typeIds = await fetchAllShipTypeIds();

    // 步骤 2: 获取并保存完整船型数据
    await fetchAndSaveShipData(typeIds);

    console.log('\n✨ 所有任务完成!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
