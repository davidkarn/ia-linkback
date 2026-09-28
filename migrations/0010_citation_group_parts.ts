import { Kysely, sql } from 'kysely';

// Citation groups hold their places' parts themselves, replacing citation_locations: each group
// becomes a row per place it cites, with part1_type/part1_value ... part8_type/part8_value in the
// order the locations were given, and a raw label (its locations' raw labels, joined). A range is
// a row per place: chapter 1 with verses 2, 3 and 4 is three rows. (core/citation_groups.ts makes
// new rows the same way; the conversion is repeated here so this migration stays as it is.)

const PARTS = 8;

// The location types allowed (as in 0005_widen_citation_location_types.ts)
const TYPES = [
  'page', 'chapter', 'book', 'volume', 'question', 'article', 'lecture', 'position', 'verse', 'part',
  'bekker number', 'line', 'stephanus number', 'objection', 'sed contra', 'respondeo', 'ad', 'distinction',
];

// Rows per insert, well under Postgres's 65535 parameters
const CHUNK = 500;

// The tables as this migration sees them
type Tables = { citation_groups: Record<string, string | number | null> };

type Location = { citation_group_id: string, citation_id: string, type: string, raw: string, value: number };

// The rows a group's locations become: one per combination of its types' values
const placesOf = (locations: Location[]) => {
  const values = new Map<string, number[]>();
  const raws   = new Set<string>();
  for (const l of locations) {
    const seen = values.get(l.type) ?? [];
    values.set(l.type, seen.includes(l.value) ? seen : [...seen, l.value]);
    raws.add(l.raw);
  }

  const types = [...values.keys()].slice(0, PARTS);
  return types
    .reduce<[string, number][][]>(
      (partial, type) => partial.flatMap((parts) => values.get(type)!.map((v) => [...parts, [type, v] as [string, number]])),
      [[]],
    )
    .map((parts) => ({ raw: [...raws].join(', '), parts }));
};

const partColumns = (parts: [string, number][]) => Object.fromEntries(
  Array.from({ length: PARTS }, (_, i) => [
    [`part${ i + 1 }_type`, parts[i]?.[0] ?? null],
    [`part${ i + 1 }_value`, parts[i]?.[1] ?? null],
  ]).flat(),
);

const typeCheck = (n: number) => sql`check (${ sql.ref(`part${ n }_type`) } in (${
  sql.join(TYPES.map((t) => sql.lit(t))) }))`;

export async function up(db: Kysely<Tables>): Promise<void> {
  await sql`alter table citation_groups add column raw text not null default ''`.execute(db);
  for (let n = 1; n <= PARTS; n++) {
    await sql`alter table citation_groups
      add column ${ sql.ref(`part${ n }_type`) } text ${ typeCheck(n) },
      add column ${ sql.ref(`part${ n }_value`) } integer`.execute(db);
  }

  const locations = (await sql<Location>`
    select citation_group_id, citation_id, type, raw, value from citation_locations
    order by citation_group_id, id`.execute(db)).rows;
  const byGroup   = new Map<string, Location[]>();
  for (const l of locations) {
    const group = byGroup.get(l.citation_group_id);
    if (group) {
      group.push(l);
    }
    else {
      byGroup.set(l.citation_group_id, [l]);
    }
  }

  const rows = [...byGroup.values()].flatMap((group) => placesOf(group).map((place) => ({
    citation_id: group[0]!.citation_id, raw: place.raw, ...partColumns(place.parts),
  })));

  // the groups as they were, to delete once their rows are in (their locations go with them)
  const { last } = (await sql<{ last: string | null }>`select max(id) as last from citation_groups`
    .execute(db)).rows[0]!;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insertInto('citation_groups').values(rows.slice(i, i + CHUNK)).execute();
  }
  if (last !== null) {
    await sql`delete from citation_groups where id <= ${ last }`.execute(db);
  }

  await sql`drop table citation_locations`.execute(db);
  await sql`alter table citation_groups
    alter column raw drop default,
    alter column part1_type set not null,
    alter column part1_value set not null`.execute(db);
}

// Puts each group's parts back as citation_locations rows, each with its group's raw label. The
// rows a range was split into stay separate groups.
export async function down(db: Kysely<Tables>): Promise<void> {
  await sql`create table citation_locations (
    id bigserial primary key,
    citation_id bigint not null references citations(id) on delete cascade,
    citation_group_id bigint not null references citation_groups(id) on delete cascade,
    type text not null,
    raw text not null,
    value integer not null,
    constraint citation_locations_type_check check (type in (${ sql.join(TYPES.map((t) => sql.lit(t))) })))`
    .execute(db);
  await sql`create index citation_locations_citation_id_idx on citation_locations (citation_id)`.execute(db);
  await sql`create index citation_locations_citation_group_id_idx on citation_locations (citation_group_id)`
    .execute(db);

  const parts = sql.join(Array.from({ length: PARTS }, (_, i) => (
    sql`(${ i + 1 }, ${ sql.ref(`g.part${ i + 1 }_type`) }, ${ sql.ref(`g.part${ i + 1 }_value`) })`
  )));
  await sql`insert into citation_locations (citation_id, citation_group_id, type, raw, value)
    select g.citation_id, g.id, p.type, g.raw, p.value
    from citation_groups g cross join lateral (values ${ parts }) p(n, type, value)
    where p.type is not null
    order by g.id, p.n`.execute(db);

  for (let n = 1; n <= PARTS; n++) {
    await sql`alter table citation_groups
      drop column ${ sql.ref(`part${ n }_type`) }, drop column ${ sql.ref(`part${ n }_value`) }`.execute(db);
  }
  await sql`alter table citation_groups drop column raw`.execute(db);
}
