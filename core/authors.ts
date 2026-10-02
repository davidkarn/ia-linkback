// Authors (the authors table) and the names they go by
// (alternate_author_names). Pure functions; model/authors.ts reads and
// saves them.

// What books give as the author of a book that has none
const NO_AUTHOR = ['anonymous', 'bible'];

// Whether a book's author (books.author) names an author: not "Anonymous",
// the Bible, or nothing
export const namesAnAuthor = (author: string): boolean => {
  const name = author.trim().toLowerCase();
  return name.length > 0 && !NO_AUTHOR.includes(name);
};
