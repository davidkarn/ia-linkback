// citation_groups rows: one per place a citation cites (see core/citation_groups.ts).
import type { Insertable } from 'kysely';
import type { CitationGroupsTable } from '../api/database.ts';
import { partColumns, type PlaceGroup } from '../core/citation_groups.ts';

// The row for a place a citation cites
export const groupRow = (citationId: string, place: PlaceGroup) => ({
  citation_id: citationId,
  raw:         place.raw,
  ...partColumns(place.parts),
}) as Insertable<CitationGroupsTable>;
