# PROJECT KNOWLEDGE BASE

**Generated:** 2026-02-04
**Project:** zKillboard Killmail Statistics Tool (EVE Online)

## OVERVIEW

TypeScript CLI tool for fetching and analyzing EVE Online corporation killmail statistics from zKillboard API and ESI API.

## BUILD & TEST

```bash
# Build
npm run build          # Compile TypeScript to dist/

# Run
npm run stats         # Run killmail stats
npm run dev           # Run with ts-node (development)

# Data management
npm run fetch-ships           # Fetch ship data from ESI API
npm run gen-ship-mapping      # Generate Chinese ship name mapping

# Parameters
npm run stats -- --corp 98626718 --pages 5 --names --year 2026 --month 01
```

## CODE STYLE

### TypeScript Conventions

**Strict Mode Enabled** - No `any`, no type suppression, full type safety.

**Imports:**
```typescript
// Named imports for multiple items
import { Function1, Function2, Type1, Type2 } from './module';

// Default import + named
import axios, { AxiosInstance, AxiosError } from 'axios';

// Relative paths - avoid excessive nesting
import { Killmail } from './types';      // ✅ Good
import { CorpStats } from '../../types';  // ❌ Avoid
```

**Types vs Interfaces:**
- Use `interface` for object shapes (extensible)
- Use `type` for unions, primitives, mapped types
- Export all types from `src/types.ts`

**Naming:**
```
Classes:          PascalCase (ZKillboardAPI, KillmailStats)
Interfaces:       PascalCase (ParticipantStats, Killmail)
Types:            PascalCase (ShipTypeStats)
Constants:        UPPER_SNAKE_CASE (ESI_BASE_URL)
Variables/Func:   camelCase (getKills, characterNames)
Private fields:   private camelCase (this.client, this.config)
```

**Error Handling:**
```typescript
// ✅ Correct pattern
try {
  const response = await this.client.get<T>(url);
  return response.data;
} catch (error) {
  this.handleError(error as AxiosError);
  return [];  // Always return empty/fallback
}

// ❌ Never do this
catch (e) { /* empty */ }
catch (e) { throw e; }
catch (e) { return null; }  // Inconsistent
```

**Async/Await:**
```typescript
// ✅ Correct
async getData(): Promise<Data[]> {
  try {
    return await this.client.get('/data');
  } catch {
    return [];
  }
}

// ✅ Also correct (Promise.all for parallel)
const results = await Promise.all(items.map(item => fetch(item)));
```

**Null/Undefined:**
```typescript
// Optional parameters
function process(options?: { page?: number } = {}): void {
  const page = options?.page ?? 1;  // ✅ Nullish coalescing
}

// Optional chaining
const name = attacker.characterName?.toString();  // ✅ Safe access
```

**Async Patterns:**
```typescript
// Parallel execution
const results = await Promise.all(promises);

// Sequential when needed
for (const item of items) {
  await process(item);
}

// Delay helper
private delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## API REFERENCE

### zKillboard API

**Docs:** https://github.com/zKillboard/zKillboard/wiki/API-(Killmails)

**Endpoints Used:**
```
GET /api/kills/corporationID/{id}/page/{n}/
GET /api/kills/corporationID/{id}/pastSeconds/{seconds}/
GET /api/kills/corporationID/{id}/warID/{warId}/
GET /api/kills/corporationID/{id}/solo/
GET /api/kills/corporationID/{id}/w-space/
```

**Rate Limits:** Respect API limits, use `delay()` between requests (1000ms default).

**Headers Required:**
```
User-Agent: YourName your@email.com
Accept-Encoding: gzip
```

### ESI API (Character Names)

**Docs:** https://developers.eveonline.com/api-explorer

**Endpoints Used:**
```
POST /universe/names/          # Batch character name lookup
GET /universe/types/{id}/       # Ship type details (language=zh)
GET /universe/categories/{id}/  # Ship categories
GET /universe/groups/{id}/      # Ship groups with types
```

**Pattern for Batch Lookup:**
```typescript
// IDs → Names mapping
const ids = [12345, 67890];
const response = await esiClient.post('/universe/names/', ids);
// Returns: [{id, name, category}, ...]
```

## PROJECT STRUCTURE

```
src/
├── api.ts          # zKillboard API client
├── esi.ts          # ESI API client (character names)
├── index.ts        # CLI entry point (commander)
├── stats.ts        # Statistics calculation
├── types.ts        # TypeScript interfaces/types
└── data/
    └── ships-zh.json    # Auto-generated ship names (558 ships)

scripts/
├── fetch-ship-names.ts        # Fetch ships from ESI
└── generate-ship-mapping.ts   # Generate TypeScript mapping
```

## COMMON TASKS

**Add new API endpoint:**
1. Add method to `ZKillboardAPI` class in `src/api.ts`
2. Add types to `src/types.ts`
3. Update `src/index.ts` CLI options if needed

**Add ship type:**
1. Run `npm run fetch-ships` to update `ships-zh.json`
2. Run `npm run gen-ship-mapping` to regenerate mapping in `src/api.ts`

**Test with different corporation:**
```bash
npm run stats -- --corp CORPORATION_ID --names
```

## GOTCHAS

1. **zKillboard returns simplified data** - Must fetch full details via ESI `/killmails/{id}/{hash}/`
2. **Character names require batch lookup** - Use `POST /universe/names/` (max 1000 IDs)
3. **Ship names from ESI** - Use `language=zh` parameter for Chinese names
4. **API returns 1000 max per page** - Implement pagination for large datasets
5. **Chinese JSON encoding** - Ensure UTF-8 for `ships-zh.json`
