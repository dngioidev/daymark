import type { StandaloneNote } from '../../types/daymark';

const note = (id: string, title: string, content: string, tags: string[] = []): StandaloneNote => ({
  id, title, content, tags, folder: 'Fixture', createdAt: '2026-10-28', updatedAt: '2026-10-28',
});

/** Hand-labelled topic clusters; cross-cluster pairs are unrelated. */
export const relatedNotes = [
  note('java', 'Java basics', 'Java classes objects methods collections runtime.', ['java']),
  note('java21', 'Java 21 news', 'Java runtime classes virtual threads collections news.', ['java']),
  note('streams', 'Java Streams', 'Java streams collections filter methods pipeline.', ['java']),
  note('collections', 'Java collections', 'Java collections classes methods list streams.', ['java']),
  note('indexes', 'SQL indexes', 'SQL database indexes query planner tables performance.', ['database']),
  note('joins', 'SQL Joins', 'SQL database joins query tables relational indexes.', ['database']),
  note('planner', 'Query planner', 'SQL database query planner indexes optimization.', ['database']),
  note('schema', 'Database schema', 'SQL database tables relational schema joins.', ['database']),
  note('cooking', 'Cooking soup', 'Cooking soup vegetables broth simmer seasoning.', ['kitchen']),
  note('broth', 'Vegetable broth', 'Cooking vegetables broth soup simmer carrots.', ['kitchen']),
  note('seasoning', 'Soup seasoning', 'Soup cooking seasoning broth vegetables herbs.', ['kitchen']),
  note('travel', 'Mountain travel', 'Travel mountain hiking trail backpack camping.', ['holiday']),
  note('hiking', 'Hiking equipment', 'Mountain hiking backpack camping trail boots.', ['holiday']),
  note('camping', 'Camping trail', 'Travel camping trail mountain hiking tent.', ['holiday']),
  note('viet-java', 'Lập trình Java', 'Lập trình Java lớp đối tượng phương thức bộ nhớ.', ['lập trình']),
  note('viet-java-plain', 'Lap trinh Java nang cao', 'Lap trinh Java lop doi tuong phuong thuc bo nho.', ['lap trinh']),
  note('viet-food', 'Nấu bánh truyền thống', 'Nấu bánh bột đường trứng lò nướng công thức.', ['ẩm thực']),
  note('viet-food-plain', 'Nau banh tai nha', 'Nau banh bot duong trung lo nuong cong thuc.', ['am thuc']),
  note('linked', 'Java reference', 'Java classes methods runtime [[Java basics]].', ['java']),
  note('empty', 'Java', ''),
];

export const relatedPairs = [
  { a: 'java', b: 'java21', terms: ['java', 'classes'] },
  { a: 'java', b: 'streams', terms: ['java', 'collections'] },
  { a: 'indexes', b: 'joins', terms: ['sql', 'database'] },
  { a: 'indexes', b: 'planner', terms: ['query', 'indexes'] },
  { a: 'cooking', b: 'broth', terms: ['soup', 'broth'] },
  { a: 'travel', b: 'hiking', terms: ['mountain', 'hiking'] },
  { a: 'viet-java', b: 'viet-java-plain', terms: ['lap', 'trinh', 'doi'] },
  { a: 'viet-food', b: 'viet-food-plain', terms: ['banh', 'duong', 'nuong'] },
];

export const unrelatedGroups = [
  ['java', 'java21', 'streams', 'collections', 'viet-java', 'viet-java-plain', 'linked'],
  ['indexes', 'joins', 'planner', 'schema'],
  ['cooking', 'broth', 'seasoning'],
  ['travel', 'hiking', 'camping'],
  ['viet-food', 'viet-food-plain'],
];
