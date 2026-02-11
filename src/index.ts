/**
 * zKillboard 击杀统计工具 - 主入口
 *
 * 用法:
 *   npm run stats -- --corp 98626718
 *   npm run stats -- --corp 98626718 --sort kills
 *   npm run stats -- --corp 98626718 --sort finalblows
 */

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import * as path from 'path';
import { ZKillboardAPI } from './api';
import { ESI } from './esi';
import { KillmailStats, createStats } from './stats';

// ==================== 常量配置 ====================
const DEFAULT_CORP_ID = '98626718';
const DEFAULT_YEAR = '2026';
const DEFAULT_MONTH = '01';
const DEFAULT_TOP = '100';

// 加载环境变量
dotenv.config();

async function main() {
  const program = new Command();

  program
    .name('zkb-stats')
    .description('EVE Online Corporation Killmail Statistics Tool')
    .version('1.0.0')
    .option('-c, --corp <id>', 'Corporation ID', process.env.CORPORATION_ID || DEFAULT_CORP_ID)
    .option('-s, --sort <field>', 'Sort by: kills, finalblows', 'kills')
    .option('-t, --top <n>', 'Limit output to top N participants', DEFAULT_TOP)
    .option('--solo', 'Only include solo kills')
    .option('--wspace', 'Only include w-space kills')
    .option('--year <yyyy>', 'Filter by year', DEFAULT_YEAR)
    .option('--month <mm>', 'Filter by month', DEFAULT_MONTH)
    .option('--names', 'Fetch and display character names')
    .action(async (options) => {
      await runStats(options);
    });

  program.parse();
}

async function runStats(options: any): Promise<void> {
  const corporationId = parseInt(options.corp, 10);

  if (isNaN(corporationId) || corporationId <= 0) {
    console.error('错误: 无效的 Corporation ID');
    process.exit(1);
  }

  const year = parseInt(options.year, 10);
  const month = parseInt(options.month, 10);
  const timeStr = `${year}-${month.toString().padStart(2, '0')}`;

  console.log('='.repeat(60));
  console.log(`  EVE Online 击杀统计工具`);
  console.log(`  Corporation ID: ${corporationId}`);
  console.log(`  时间范围: ${timeStr}`);
  if (options.names) {
    console.log(`  角色名称: 已启用`);
  }
  console.log('='.repeat(60));
  console.log();

  // 创建 API 客户端
  const api = new ZKillboardAPI({
    corporationID: corporationId,
    maxPages: 10,
    userAgent: process.env.USER_AGENT || 'zkb-stats-tool',
  });

  // 创建统计实例
  const stats = createStats(corporationId);

  // 获取击杀数据
  const filters = {
    solo: options.solo || false,
    wspace: options.wspace || false,
    year,
    month,
  };

  const killmails = await api.getAllKills(filters);

  if (killmails.length === 0) {
    console.log('未找到击杀记录！');
    return;
  }

  console.log();

  // 如果需要获取角色名称
  if (options.names) {
    console.log('👤 正在获取角色名称...');
    const esi = new ESI({ userAgent: process.env.USER_AGENT || 'zkb-stats-tool' });

    const characterIds = new Set<number>();
    for (const killmail of killmails) {
      for (const attacker of killmail.attackers || []) {
        if (attacker.characterID && attacker.corporationID === corporationId) {
          characterIds.add(attacker.characterID);
        }
      }
    }

    console.log(`  发现 ${characterIds.size} 个成员角色...`);
    const characterNames = await esi.getCharacterNames(Array.from(characterIds));
    stats.setCharacterNames(characterNames);
    console.log(`  获取到 ${Object.keys(characterNames).length} 个角色名称\n`);
  }

  // 处理击杀数据
  stats.processKillmails(killmails);

  // 输出 Markdown 文件
  await outputMarkdown(stats, options, corporationId, timeStr);
}

async function outputMarkdown(stats: KillmailStats, options: any, corporationId: number, timeStr: string): Promise<void> {
  const sortBy = (options.sort as 'kills' | 'finalblows') || 'kills';
  const topN = parseInt(options.top, 10) || 100;
  const summary = stats.getSummary();
  const ranking = stats.getParticipantRanking({ sortBy, limit: topN });

  // 收集参与者的船只数据
  const rankingWithShips = ranking.map(p => ({
    participant: p,
    ships: stats.getParticipantShips(p.characterID)
  }));
  const maxShipCount = Math.max(...rankingWithShips.map(r => r.ships.length), 0);

  // 构建 Markdown 内容
  const lines: string[] = [];
  lines.push(`# ${corporationId} 击杀统计 (${timeStr})`, '');
  lines.push(`**统计时间**: ${new Date().toLocaleString('zh-CN')}`, '');
  lines.push(`**总击杀**: ${summary.totalKills}`, '');
  lines.push(`**参与人数**: ${summary.totalParticipants}`, '');
  lines.push('', '## 参与者击杀排名', '');

  // 表头
  const header = ['角色名称', '击杀数', 'Final Blow', ...Array(maxShipCount).fill(0).map((_, i) => `船型${i + 1}`)];
  lines.push('| ' + header.join(' | ') + ' |');
  lines.push('| ' + header.map(() => '-'.repeat(8)).join(' | ') + ' |');

  // 数据行
  for (const { participant, ships } of rankingWithShips) {
    const name = getCharacterDisplayName(participant.characterName || 'Unknown');
    const shipCells = Array(maxShipCount).fill('');
    ships.forEach((ship, i) => {
      if (i < maxShipCount) shipCells[i] = `${ship.shipType}（${ship.count}）`;
    });
    lines.push(`| ${name} | ${participant.totalKills} | ${participant.finalBlows} | ${shipCells.join(' | ')} |`);
  }

  // 保存文件
  const outputFile = path.join(process.cwd(), 'stats', `${corporationId}-${timeStr}.md`);
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, lines.join('\n'), 'utf-8');

  console.log(`已生成 Markdown 文件: ${outputFile}`);
}

// 提取纯角色名称，去掉括号里的 ID，并清理换行符
function getCharacterDisplayName(fullName: string): string {
  // 移除换行符和多余空白
  const cleaned = fullName.replace(/[\r\n]+/g, ' ').trim();
  const match = cleaned.match(/^(.+?)\s*\((\d+)\)$/);
  return match ? match[1].trim() : cleaned;
}

// 启动程序
main().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
