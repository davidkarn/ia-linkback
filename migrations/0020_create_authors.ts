import { Kysely, sql } from 'kysely';

// Authors, and the names they go by (alternate_author_names: "Aristotle",
// "The Philosopher", "The Stagirite"), each author's own name among them;
// books point at their author (books.author_id), which books.author names
// as its source gave it. A name belongs to one author (unique, ignoring
// case), so a name finds its author. updated_at is kept by triggers.
//
// The books' authors are added from books.author: spellings of one author
// merged ("Saint Augustine" and "Augustine of Hippo"), catalogue forms
// ("Humphrey, William, 1839-1910") named as people are, and a book by
// several authors given its first. Books with no author ("Anonymous", the
// Bible) are left without one. Each book's author string is kept among its
// author's names.

// books.author values that name no author
const NO_AUTHOR = ['Anonymous', 'Bible', ''];

// books.author values that aren't how the author is named: the name to use
const AUTHOR_NAMES: Record<string, string> = {
  'Saint Augustine':                                            'Augustine of Hippo',
  'St. Thomas Aquinas':                                         'Thomas Aquinas',
  'P. Coffey':                                                  'Peter Coffey',
  'arthur preuss':                                              'Arthur Preuss',
  'Humphrey, William, 1839-1910':                               'William Humphrey',
  'Driscoll, John T. (John Thomas), 1866-':                     'John T. Driscoll',
  'Denzinger, Heinrich, 1819-1883; Stahl, Ignaz, 1839-1902':    'Heinrich Denzinger',
  'Joseph Wilhelm and Thomas B. Scannell':                      'Joseph Wilhelm',
  'Wulf, M. de (Maurice), 1867-1947; Coffey, Peter, b. 1876; Wulf, M. de (Maurice), 1867-1947':
    'Maurice De Wulf',
};

// Other names of authors, as they're named and cited ("Aug.", "S. Thom."),
// by their names. Names that would fit more than one author ("Gregory",
// "Clement", "Cyril") are left out.
const ALTERNATE_NAMES: Record<string, string[]> = {
  'Aristotle': [
    'The Philosopher', 'Philosopher', 'The Stagirite', 'Stagirite', 'Aristoteles', 'Aristot.',
    'Arist.',
  ],
  'Thomas Aquinas': [
    'St. Thomas Aquinas', 'St Thomas Aquinas', 'Saint Thomas Aquinas', 'Aquinas', 'St. Thomas',
    'St Thomas', 'Saint Thomas', 'S. Thomas', 'S. Thom.', 'St. Thom.', 'D. Thomas', 'Divus Thomas',
    'Thomas de Aquino', 'Thomas of Aquin', 'The Angelic Doctor', 'Angelic Doctor',
    'Doctor Angelicus',
  ],
  'Augustine of Hippo': [
    'Augustine', 'St. Augustine', 'St Augustine', 'S. Augustine', 'Augustinus', 'Augustin',
    'S. Augustinus', 'Aug.', 'S. Aug.', 'St. Aug.', 'August.', 'Doctor of Grace',
  ],
  'Boethius': [
    'Boetius', 'Severinus Boethius', 'Anicius Manlius Severinus Boethius', 'Boeth.',
  ],
  'Ambrose of Milan': [
    'Ambrose', 'St. Ambrose', 'St Ambrose', 'Saint Ambrose', 'S. Ambrose', 'Ambrosius', 'Ambr.',
  ],
  'Athanasius':        ['St. Athanasius', 'Saint Athanasius', 'Athanasius of Alexandria', 'Athan.'],
  'Basil of Caesarea': [
    'Basil', 'St. Basil', 'Saint Basil', 'Basil the Great', 'St. Basil the Great', 'Basilius',
    'Bas.',
  ],
  'John Chrysostom': [
    'Chrysostom', 'St. Chrysostom', 'St. John Chrysostom', 'Saint John Chrysostom',
    'Joannes Chrysostomus', 'Chrys.', 'Chrysost.',
  ],
  'Jerome':            ['St. Jerome', 'St Jerome', 'Saint Jerome', 'Hieronymus', 'Hier.', 'Hieron.'],
  'Gregory the Great': [
    'St. Gregory the Great', 'Pope Gregory I', 'Gregory I', 'Gregorius Magnus', 'St. Gregory',
    'S. Greg.',
  ],
  'Gregory of Nazianzus': [
    'Gregory Nazianzen', 'St. Gregory Nazianzen', 'Gregory the Theologian', 'Nazianzen',
    'Greg. Naz.',
  ],
  'Gregory of Nyssa':      ['Gregory Nyssen', 'St. Gregory of Nyssa', 'Nyssen', 'Greg. Nyss.'],
  'Gregory Thaumaturgus':  ['Gregory the Wonderworker', 'St. Gregory Thaumaturgus'],
  'Cyprian':               ['St. Cyprian', 'Saint Cyprian', 'Cyprian of Carthage', 'Cyprianus', 'Cypr.'],
  'Tertullian':            ['Tertullianus', 'Tert.'],
  'Origen':                ['Origenes', 'Orig.'],
  'Irenaeus':              ['St. Irenaeus', 'Irenaeus of Lyons', 'Irenæus', 'Iren.'],
  'Ignatius of Antioch':   ['St. Ignatius of Antioch', 'Ignatius Theophorus'],
  'Justin Martyr':         ['St. Justin', 'St. Justin Martyr', 'Justin', 'Justinus'],
  'Clement of Alexandria': ['Clemens Alexandrinus', 'Clem. Alex.', 'Clement of Alex.'],
  'Clement of Rome':       ['St. Clement of Rome', 'Pope Clement I', 'Clemens Romanus'],
  'Hilary of Poitiers':    ['Hilary', 'St. Hilary', 'Saint Hilary', 'Hilarius', 'Hilar.'],
  'Cyril of Alexandria':   ['St. Cyril of Alexandria', 'Cyril. Alex.'],
  'Cyril of Jerusalem':    ['St. Cyril of Jerusalem'],
  'John of Damascus':      [
    'John Damascene', 'St. John Damascene', 'Damascene', 'Joannes Damascenus', 'Damasc.',
  ],
  'Leo the Great':              ['St. Leo the Great', 'Pope Leo I', 'Leo I', 'St. Leo'],
  'Eusebius of Caesarea':       ['Eusebius', 'Eusebius Pamphili', 'Euseb.'],
  'Lactantius':                 ['Lact.'],
  'Hippolytus':                 ['St. Hippolytus', 'Hippolytus of Rome'],
  'Ephrem the Syrian':          ['St. Ephrem', 'Ephraem Syrus', 'Ephraim the Syrian'],
  'Rufinus of Aquileia':        ['Rufinus', 'Tyrannius Rufinus'],
  'John Cassian':               ['Cassian', 'Joannes Cassianus'],
  'Theodoret':                  ['Theodoret of Cyrus', 'Theodoret of Cyrrhus'],
  'Vincent of Lérins':          ['Vincent of Lerins', 'St. Vincent of Lérins', 'Vincentius Lirinensis'],
  'Polycarp':                   ['St. Polycarp', 'Polycarp of Smyrna'],
  'Methodius':                  ['Methodius of Olympus', 'St. Methodius'],
  'Athenagoras':                ['Athenagoras of Athens'],
  'G. K. Chesterton':           ['Chesterton', 'Gilbert Keith Chesterton'],
  'Étienne Gilson':             ['Etienne Gilson', 'Gilson'],
  'Jacques Maritain':           ['Maritain'],
  'Réginald Garrigou-Lagrange': ['Reginald Garrigou-Lagrange', 'Garrigou-Lagrange'],
  'Joseph Pohle':               ['Pohle'],
  'Heinrich Denzinger':         ['Denzinger'],
};

const nameOf = (author: string) => AUTHOR_NAMES[author] ?? author;

const updatedAtTrigger = async(db: Kysely<unknown>, table: string) => {
  await sql`create function ${ sql.raw(table) }_set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end
    $$ language plpgsql`.execute(db);

  await sql`create trigger ${ sql.raw(table) }_updated_at
    before update on ${ sql.table(table) }
    for each row execute function ${ sql.raw(table) }_set_updated_at()`.execute(db);
};

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table authors (
    id bigserial primary key,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`.execute(db);
  await sql`create unique index authors_name_idx on authors (lower(name))`.execute(db);
  await updatedAtTrigger(db, 'authors');

  await sql`create table alternate_author_names (
    id bigserial primary key,
    author_id bigint not null references authors(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`.execute(db);
  await sql`create unique index alternate_author_names_name_idx
    on alternate_author_names (lower(name))`.execute(db);
  await sql`create index alternate_author_names_author_id_idx
    on alternate_author_names (author_id)`.execute(db);
  await updatedAtTrigger(db, 'alternate_author_names');

  await sql`alter table books
    add column author_id bigint references authors(id) on delete set null`.execute(db);
  await sql`create index books_author_id_idx on books (author_id)`.execute(db);

  // the books' authors, and each one's names: its own, how its books give
  // it, and its other names
  const bookAuthors = (await sql<{ author: string }>`select distinct author from books`
    .execute(db)).rows.map((r) => r.author).filter((a) => !NO_AUTHOR.includes(a));
  const names       = new Map<string, string[]>();
  for (const author of bookAuthors) {
    const name = nameOf(author);
    names.set(name, [...(names.get(name) ?? [name]), author]);
  }

  for (const [name, given] of names) {
    const { rows: [author] } = await sql<{ id: string }>`
      insert into authors (name) values (${ name }) returning id`.execute(db);

    const all = [...given, ...(ALTERNATE_NAMES[name] ?? [])];
    const own = all.filter((n, i) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
    await sql`insert into alternate_author_names (author_id, name)
      values ${ sql.join(own.map((n) => sql`(${ author!.id }, ${ n })`)) }`.execute(db);

    await sql`update books set author_id = ${ author!.id }
      where author in (${ sql.join(given) })`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`alter table books drop column author_id`.execute(db);
  await sql`drop table alternate_author_names`.execute(db);
  await sql`drop table authors`.execute(db);
  await sql`drop function alternate_author_names_set_updated_at()`.execute(db);
  await sql`drop function authors_set_updated_at()`.execute(db);
}
