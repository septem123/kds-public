/**
 * 根据 ships-zh.json 生成中文船型映射表
 *
 * 用法: npx ts-node scripts/generate-ship-mapping.ts
 *
 * 功能:
 * 1. 读取 ships-zh.json 数据
 * 2. 生成 TypeScript 格式的映射表
 * 3. 直接更新 src/api.ts 文件
 */

import * as fs from 'fs';
import * as path from 'path';

const SHIPS_DATA_FILE = path.join(__dirname, '../src/data/ships-zh.json');
const API_FILE = path.join(__dirname, '../src/api.ts');

// 按 Group ID 分组的注释
const GROUP_NAMES: Record<number, string> = {
  25: '护卫舰 (Frigate)',
  26: '驱逐舰 (Destroyer)',
  27: '巡洋舰 (Cruiser)',
  28: '攻击舰 (Cruiser - Attack)',
  29: '殖民舰 (Colonization Ship)',
  30: '工业舰 (Industrial)',
  31: '采矿舰 (Mining frigate)',
  237: '后勤舰 (Logistics)',
  324: '电子战舰 (Electronic Warfare)',
  358: '侦察舰 (Recon)',
  380: '截击舰 (Interceptor)',
  381: '隐秘行动舰 (Covert Ops)',
  419: '战列巡洋舰 (Battlecruiser)',
  420: '战列舰 (Battleship)',
  463: '重型突袭舰 (Heavy Assault Cruiser)',
  485: '无畏舰 (Dreadnought)',
  513: '航空母舰 (Carrier)',
  540: '指挥舰 (Command Ship)',
  541: '重型拦截舰 (Heavy Interdictor)',
  543: '突袭舰 (Assault Ship)',
  547: '超级航母 (Super Carrier)',
  659: '航空战列舰 (Marauder)',
  830: '电子战舰 (EW)',
  831: '隐侦 (Tactical Destroyer)',
  832: '战列舰',
  833: '战列巡洋舰',
  834: '巡洋舰',
  883: '护卫舰',
  893: '极光级',
  894: '奥尔杜',
  898: '战列舰',
  900: '巡洋舰',
  902: '驱逐舰',
  906: '护卫舰',
  941: '无畏舰',
  963: '战列巡洋舰',
  1022: '战列舰',
  1201: '泰坦',
  1202: '超级航母',
  1283: '采矿驳船',
  1305: '工业',
  1527: '护卫舰',
  1534: '巡洋舰',
  1538: '战列巡洋舰',
  1972: '驱逐舰',
  2001: '护卫舰',
  4594: '战列巡洋舰',
  4902: '航空战列舰',
};

/**
 * 生成船型映射表的 TypeScript 代码
 */
function generateShipMapping(shipsData: any): string {
  const ships = shipsData.ships;
  const entries = Object.entries(ships);

  // 按 group_id 分组
  const grouped: Record<number, Array<[string, any]>> = {};

  for (const [typeId, shipData] of entries) {
    const groupId = (shipData as any).group_id;
    if (!grouped[groupId]) {
      grouped[groupId] = [];
    }
    grouped[groupId].push([typeId, shipData]);
  }

  // 生成代码
  let code = '';

  // 按 group_id 排序
  const sortedGroupIds = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);

  for (const groupId of sortedGroupIds) {
    const groupShips = grouped[groupId];
    const groupName = GROUP_NAMES[groupId] || `Group_${groupId}`;

    // 按 typeId 排序
    groupShips.sort((a, b) => Number(a[0]) - Number(b[0]));

    code += `\n  // ${groupName} (Group ID: ${groupId})\n`;
    code += `  // ----------------------------------------\n`;

    for (const [typeId, shipData] of groupShips) {
      const name = (shipData as any).name;
      // 转义特殊字符
      const safeName = name
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'");
      code += `  ${typeId}: '${safeName}',\n`;
    }
  }

  return code;
}

/**
 * 更新 src/api.ts 文件
 */
function updateApiFile(apiContent: string, mappingCode: string): string {
  // 查找并替换 shipNames 映射表
  const pattern = /(\/\/\s*常用船型映射表\s*\n\s*const shipNames: Record<number, string> = \{)[^}]*(\};)/gs;

  const newMapping = `// 自动生成的中文船型映射表 (来自 ships-zh.json)
  // 共 ${Object.keys(JSON.parse(fs.readFileSync(SHIPS_DATA_FILE, 'utf-8')).ships).length} 个船型
  const shipNames: Record<number, string> = {${mappingCode}
  };`;

  const newContent = apiContent.replace(pattern, newMapping);

  if (newContent === apiContent) {
    throw new Error('未找到 shipNames 映射表，无法更新');
  }

  return newContent;
}

/**
 * 主函数
 */
function main(): void {
  console.log('='.repeat(60));
  console.log('  生成中文船型映射表');
  console.log('='.repeat(60));
  console.log();

  try {
    // 1. 读取船型数据
    console.log('📖 读取船型数据...');
    const shipsData = JSON.parse(fs.readFileSync(SHIPS_DATA_FILE, 'utf-8'));
    const shipCount = Object.keys(shipsData.ships).length;
    console.log(`  共 ${shipCount} 个船型\n`);

    // 2. 生成映射表代码
    console.log('🔧 生成映射表代码...');
    const mappingCode = generateShipMapping(shipsData);
    console.log(`  生成 ${mappingCode.split('\n').length} 行代码\n`);

    // 3. 读取并更新 api.ts
    console.log('📝 更新 src/api.ts...');
    const apiContent = fs.readFileSync(API_FILE, 'utf-8');
    const newContent = updateApiFile(apiContent, mappingCode);
    fs.writeFileSync(API_FILE, newContent, 'utf-8');
    console.log('  更新完成!\n');

    // 4. 统计信息
    console.log('='.repeat(60));
    console.log('✅ 完成!');
    console.log(`📊 船型数量: ${shipCount}`);
    console.log(`📁 更新文件: ${API_FILE}`);
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
